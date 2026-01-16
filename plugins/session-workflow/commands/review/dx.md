---
name: review:dx
description: Review developer experience - make the project easier to build, run, debug, and contribute to
usage: /review:dx [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "**/*.md", ".github/**")'
    required: false
  - name: CONTEXT
    description: 'Additional context: how devs run locally, CI setup, expected onboarding path'
    required: false
examples:
  - command: /review:dx pr 123
    description: Review PR #123 for DX issues
  - command: /review:dx repo
    description: Review entire repository for DX improvements
  - command: /review:dx diff main..feature "CONTEXT: Docker setup, GitHub Actions CI, 5-minute onboarding goal"
    description: Review branch diff with DX context
---

# Developer Experience (DX) Review

You are a developer experience reviewer making the project easier to build, run, debug, and contribute to—without adding heavy tooling.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

Example:
```markdown
| Session | Created | Status |
|---------|---------|--------|
| fix-auth-bug | 2024-01-15 | ✅ |
| improve-dx  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=improve-dx`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed files in the specified PR
  - Requires `TARGET` = PR number
  - Use `gh pr diff <PR>` to get changes

- **`worktree`**: Review uncommitted changes in working tree
  - Use `git diff HEAD` for unstaged changes
  - Use `git diff --cached` for staged changes

- **`diff`**: Review diff between two refs
  - Requires `TARGET` = `ref1..ref2` (e.g., `main..feature-branch`)
  - Use `git diff ref1..ref2`

- **`file`**: Review specific file(s)
  - Requires `TARGET` = file path(s)
  - Read full file content

- **`repo`**: Review entire repository DX
  - Analyze README, documentation, scripts, CI configuration
  - Check onboarding experience end-to-end

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract DX-Relevant Files

For the scope, identify files that affect developer experience:

1. **Documentation**:
   - README.md, CONTRIBUTING.md, docs/
   - Setup guides, architecture docs
   - API documentation

2. **Configuration**:
   - package.json, requirements.txt, Cargo.toml (scripts)
   - .env.example, config files
   - .gitignore, .editorconfig

3. **Development scripts**:
   - package.json scripts, Makefile, docker-compose.yml
   - setup.sh, bootstrap scripts

4. **CI/CD**:
   - .github/workflows/, .gitlab-ci.yml, .circleci/
   - Build configurations

5. **Developer tooling**:
   - .vscode/, .idea/, .editorconfig
   - Linters, formatters, type checkers

**Critical**: Read complete files to understand full developer workflow.

## Step 3: Parse CONTEXT (if provided)

Extract DX expectations from `CONTEXT` parameter:

- **Local workflow**: How developers run the project (Docker, native, etc.)
- **CI setup**: What CI/CD system is used (GitHub Actions, GitLab CI, Jenkins)
- **Onboarding time**: Expected time for new developer to be productive (5 min, 1 hour, 1 day)
- **Prerequisites**: Required tools and versions

Example:
```
CONTEXT: Docker-based local development, GitHub Actions CI, target 5-minute onboarding for new developers, Node 18+
```

## Step 4: DX Checklist Review

Systematically check developer experience across categories:

### 4.1 Onboarding Experience
- [ ] README includes clear setup instructions?
- [ ] Prerequisites listed with versions?
- [ ] Setup works in one or few commands?
- [ ] Sample data/seeds provided?
- [ ] First-run experience smooth (no manual config)?
- [ ] CONTRIBUTING.md exists with workflow guide?

**Red flags:**
- No README or minimal README
- Missing prerequisites
- 10+ manual steps to run project
- Must read multiple docs to get started
- Broken setup instructions

**Onboarding test:**
```bash
# ❌ BAD: Complex onboarding (30+ minutes)
1. Install Node 18.x
2. Install Docker Desktop
3. Install PostgreSQL 14
4. Create database: createdb myapp_dev
5. Run migrations: npm run db:migrate
6. Install Redis
7. Start Redis: redis-server
8. Copy .env.example to .env
9. Edit .env (fill in 20 variables)
10. Generate SSL cert: openssl req -x509 ...
11. Install dependencies: npm install
12. Seed database: npm run db:seed
13. Start app: npm run dev
14. Navigate to http://localhost:3000

Problems:
- Too many manual steps
- Must install multiple services
- Manual config required
- Easy to miss a step

# ✅ GOOD: Simple onboarding (2 minutes)
1. Clone repo
2. Run: docker compose up
3. Navigate to http://localhost:3000

That's it! Docker Compose handles:
- Database setup and migrations
- Redis
- SSL cert generation
- Environment variables (sensible defaults)
- Sample data seeding

Alternative (without Docker):
1. npm install
2. npm run setup   # Interactive setup script
3. npm run dev
```

**Good README structure:**
```markdown
# Project Name

Brief description (1-2 sentences)

## Quick Start (5 minutes)

# Prerequisites
- Node 18+ (check: node --version)
- Docker Desktop (or Docker + Docker Compose)

# Setup
git clone https://github.com/org/repo
cd repo
docker compose up

# Access
- App: http://localhost:3000
- API: http://localhost:3000/api
- Docs: http://localhost:3000/docs

# Test credentials
- Email: demo@example.com
- Password: demo123

## Development

# Run tests
npm test

# Run linter
npm run lint

# Run type checker
npm run typecheck

# Format code
npm run format

## Architecture

[Link to architecture docs]

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

## Troubleshooting

### Port already in use
...

### Database connection error
...
```

### 4.2 Command Consistency
- [ ] Standard scripts defined (dev, test, build, lint)?
- [ ] Script names consistent across projects?
- [ ] Scripts documented in README?
- [ ] Scripts fail with helpful error messages?
- [ ] No need to read package.json to find commands?

**Red flags:**
- Unclear script names (what does `npm run x` do?)
- Missing standard scripts (no `npm test`)
- Scripts with cryptic errors
- Must guess command names

**Script conventions:**
```json
// ❌ BAD: Inconsistent, unclear names
{
  "scripts": {
    "start": "node dist/index.js",
    "dev-server": "ts-node src/main.ts",
    "test-all": "jest",
    "check": "tsc --noEmit",
    "prettier": "prettier --write .",
    "eslint-fix": "eslint . --fix"
  }
}

Problems:
- "start" vs "dev-server" (which for development?)
- "test-all" (is there test-some? What's the difference?)
- "check" (what does it check? types? lint?)
- Separate commands for prettier and eslint (should be one "format")

// ✅ GOOD: Consistent, clear names
{
  "scripts": {
    // Development
    "dev": "tsx watch src/main.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/index.js",

    // Testing
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",

    // Code quality
    "lint": "eslint . && prettier --check .",
    "lint:fix": "eslint . --fix && prettier --write .",
    "typecheck": "tsc --noEmit",

    // Database
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "prisma migrate reset",

    // All checks (run before commit)
    "check": "npm run typecheck && npm run lint && npm test",

    // Setup (one command to get started)
    "setup": "npm install && npm run db:migrate && npm run db:seed"
  }
}

// Makefile alternative (language-agnostic)
.PHONY: dev test lint typecheck check setup

dev:
	npm run dev

test:
	npm test

lint:
	npm run lint

typecheck:
	npm run typecheck

check: typecheck lint test

setup:
	npm install
	npm run db:migrate
	npm run db:seed
```

**Helpful error messages:**
```bash
# ❌ BAD: Cryptic error
$ npm run dev
Error: Cannot find module 'dotenv'

# User thinks: "What's dotenv? Where do I get it? Is this a bug?"

# ✅ GOOD: Actionable error
$ npm run dev

Error: Missing .env file

This project requires a .env file with configuration.

To fix:
1. Copy the example: cp .env.example .env
2. Edit .env and fill in required values:
   - DATABASE_URL (your database connection string)
   - JWT_SECRET (random string, use: openssl rand -base64 32)

For more info, see: docs/setup.md

# Or even better: Auto-create with prompts
$ npm run dev

Missing .env file. Would you like to create one? (y/n) y

Creating .env from template...

Enter DATABASE_URL (default: postgresql://localhost:5432/myapp):
> [press enter for default]

Enter JWT_SECRET (will generate random if empty):
> [press enter to auto-generate]

✓ Created .env with sensible defaults
✓ Starting development server...
```

### 4.3 Configuration Management
- [ ] Environment variables documented?
- [ ] .env.example up to date?
- [ ] Sensible defaults provided?
- [ ] Secret vs non-secret config clear?
- [ ] Config validation on startup?

**Red flags:**
- No .env.example (must guess required vars)
- Outdated .env.example (missing new vars)
- No defaults (app crashes without full config)
- Secrets in .env.example (should be placeholders)

**Config best practices:**
```bash
# ❌ BAD: .env.example with actual secrets
DATABASE_URL=postgresql://admin:password123@localhost:5432/myapp
JWT_SECRET=supersecretkey
STRIPE_API_KEY=sk_live_abc123xyz

Problems:
- Contains real-looking secrets (user might commit these)
- No indication of which are required vs optional
- No description of what each var does

# ✅ GOOD: .env.example with placeholders and docs
# Database connection (REQUIRED)
# Format: postgresql://user:password@host:port/database
DATABASE_URL=postgresql://localhost:5432/myapp_dev

# JWT secret for token signing (REQUIRED)
# Generate with: openssl rand -base64 32
# SECURITY: Keep this secret and unique per environment
JWT_SECRET=your-secret-here-replace-with-random-string

# Stripe API keys (OPTIONAL - only needed for payment features)
# Get from: https://dashboard.stripe.com/apikeys
# Use test keys (sk_test_...) for development
STRIPE_API_KEY=sk_test_your-key-here

# Redis connection (OPTIONAL - defaults to localhost)
# Only needed for caching and sessions
# REDIS_URL=redis://localhost:6379

# Log level (OPTIONAL - defaults to 'info')
# Options: debug | info | warn | error
# LOG_LEVEL=info

# Port to run on (OPTIONAL - defaults to 3000)
# PORT=3000
```

**Config validation:**
```typescript
// ❌ BAD: No validation, crashes at random times
const config = {
  database: process.env.DATABASE_URL,  // Might be undefined
  jwtSecret: process.env.JWT_SECRET,   // Might be undefined
  port: process.env.PORT || 3000
};

// Crashes later when trying to connect to database:
// TypeError: Cannot read property 'connect' of undefined

// ✅ GOOD: Validate config on startup
import { z } from 'zod';

const configSchema = z.object({
  database: z.object({
    url: z.string().url('DATABASE_URL must be a valid URL')
  }),
  jwt: z.object({
    secret: z.string().min(32, 'JWT_SECRET must be at least 32 characters')
  }),
  redis: z.object({
    url: z.string().url().optional().default('redis://localhost:6379')
  }),
  server: z.object({
    port: z.coerce.number().int().min(1).max(65535).default(3000),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info')
  }),
  stripe: z.object({
    apiKey: z.string().startsWith('sk_').optional()
  })
});

function loadConfig() {
  try {
    return configSchema.parse({
      database: {
        url: process.env.DATABASE_URL
      },
      jwt: {
        secret: process.env.JWT_SECRET
      },
      redis: {
        url: process.env.REDIS_URL
      },
      server: {
        port: process.env.PORT,
        logLevel: process.env.LOG_LEVEL
      },
      stripe: {
        apiKey: process.env.STRIPE_API_KEY
      }
    });
  } catch (error) {
    console.error('Configuration error:');
    console.error(error.errors.map(e => `  - ${e.path.join('.')}: ${e.message}`).join('\n'));
    console.error('\nCheck your .env file and see .env.example for reference.');
    process.exit(1);
  }
}

const config = loadConfig();

// ✅ Config guaranteed valid at this point
// TypeScript knows all types
```

### 4.4 Local/CI/Prod Parity
- [ ] Local setup resembles CI/prod?
- [ ] Same Node/Python/etc. version in all environments?
- [ ] Dependencies locked (package-lock.json, poetry.lock)?
- [ ] "Works on my machine" issues minimized?
- [ ] CI runs same checks developers run locally?

**Red flags:**
- Different Node versions (local 16, CI 18, prod 20)
- No lockfile (different dependency versions)
- CI failures that don't reproduce locally
- Missing checks (lint passes locally, fails in CI)

**Parity strategies:**
```yaml
# ❌ BAD: Version mismatch
# Local: node --version → v16.14.0
# CI: uses: actions/setup-node@v3 with node-version: 18
# Prod: Dockerfile FROM node:20

Problems:
- Different Node versions → different behavior
- Test passes locally, fails in CI/prod
- Hard to debug ("works on my machine")

# ✅ GOOD: Version parity
# .nvmrc (for local dev)
18.19.0

# .github/workflows/ci.yml
- uses: actions/setup-node@v3
  with:
    node-version-file: '.nvmrc'  # ✅ Reads from .nvmrc

# Dockerfile (for prod)
FROM node:18.19.0-alpine  # ✅ Same version

# package.json (enforce version)
{
  "engines": {
    "node": ">=18.19.0 <19.0.0",
    "npm": ">=9.0.0"
  }
}

# Check on npm install
{
  "scripts": {
    "preinstall": "npx check-engine"
  }
}
```

**CI/local parity:**
```yaml
# ✅ GOOD: CI runs same checks as local
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - run: npm ci

      # ✅ Same commands developers run locally
      - name: Type check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Build
        run: npm run build

# Developer runs same checks locally:
# npm run typecheck && npm run lint && npm test && npm run build

# Or single command:
# npm run check  (defined in package.json)
```

**Docker Compose for consistency:**
```yaml
# docker-compose.yml - ensures consistent environment
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://postgres:postgres@db:5432/myapp
      REDIS_URL: redis://redis:6379
    volumes:
      - .:/app
      - /app/node_modules  # Prevent overwriting
    depends_on:
      - db
      - redis

  db:
    image: postgres:14-alpine  # ✅ Same version as prod
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: myapp
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine  # ✅ Same version as prod
    volumes:
      - redis-data:/data

volumes:
  postgres-data:
  redis-data:

# Developer workflow:
# docker compose up        # Start all services
# docker compose run app npm test  # Run tests in container
# docker compose down      # Stop all services
```

### 4.5 Debuggability
- [ ] Clear log messages with context?
- [ ] Stack traces preserved (not swallowed)?
- [ ] Error messages actionable?
- [ ] Debug mode available (verbose logging)?
- [ ] Request IDs for tracing?
- [ ] Easy to attach debugger?

**Red flags:**
- Generic errors ("Something went wrong")
- Swallowed exceptions (empty catch blocks)
- No logging in critical paths
- Can't enable verbose logging
- Stack traces lost

**Logging best practices:**
```typescript
// ❌ BAD: Unclear, no context
app.post('/api/orders', async (req, res) => {
  try {
    const order = await createOrder(req.body);
    res.json(order);
  } catch (err) {
    console.error('Error');  // ❌ What error? Where? For whom?
    res.status(500).json({ error: 'Failed' });  // ❌ Not helpful
  }
});

// ✅ GOOD: Clear logs with context
import { v4 as uuidv4 } from 'uuid';

// Add request ID middleware
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

// Structured logging
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

app.post('/api/orders', async (req, res) => {
  const { id: requestId } = req;

  logger.info('Creating order', {
    requestId,
    userId: req.user?.id,
    itemCount: req.body.items?.length
  });

  try {
    const order = await createOrder(req.body);

    logger.info('Order created successfully', {
      requestId,
      orderId: order.id,
      total: order.total
    });

    res.json(order);

  } catch (err) {
    logger.error('Failed to create order', {
      requestId,
      userId: req.user?.id,
      error: err.message,
      stack: err.stack,
      input: req.body  // ⚠️  Redact sensitive fields in production
    });

    res.status(500).json({
      error: 'Failed to create order',
      requestId  // ✅ Include request ID for debugging
    });
  }
});

// Logs:
// [INFO] Creating order { requestId: 'abc-123', userId: 'user-456', itemCount: 3 }
// [ERROR] Failed to create order {
//   requestId: 'abc-123',
//   userId: 'user-456',
//   error: 'Insufficient stock for product 789',
//   stack: 'Error: Insufficient stock\n  at ...',
//   input: { items: [...] }
// }

// Developer can search logs by requestId to see full flow
```

**Debug mode:**
```typescript
// ✅ GOOD: Debug mode with verbose logging
// package.json
{
  "scripts": {
    "dev": "NODE_ENV=development LOG_LEVEL=info tsx watch src/main.ts",
    "dev:debug": "NODE_ENV=development LOG_LEVEL=debug tsx watch src/main.ts",
    "start": "NODE_ENV=production LOG_LEVEL=warn node dist/main.js"
  }
}

// Enable debug logging:
// npm run dev:debug

// Or set environment variable:
// LOG_LEVEL=debug npm run dev

// In code:
logger.debug('Database query', {
  sql: query,
  params,
  duration: Date.now() - start
});

// Only logged when LOG_LEVEL=debug
```

**Debugger support:**
```json
// .vscode/launch.json - VS Code debugger config
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug API",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "skipFiles": ["<node_internals>/**"],
      "env": {
        "LOG_LEVEL": "debug"
      }
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["test", "--", "--watch"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}

// Developer can press F5 to start debugging (breakpoints work)
```

### 4.6 Tooling Bloat
- [ ] Minimal, focused tool set?
- [ ] No overlapping tools (multiple formatters, linters)?
- [ ] Tools well-integrated?
- [ ] Clear purpose for each tool?
- [ ] Tools don't conflict?

**Red flags:**
- Multiple formatters (Prettier + custom formatter)
- Multiple linters (ESLint + TSLint + custom linter)
- Unused tools in package.json
- Tools that fight each other

**Tool consolidation:**
```json
// ❌ BAD: Tool bloat
{
  "devDependencies": {
    "eslint": "^8.0.0",
    "tslint": "^6.0.0",           // ❌ Deprecated, overlaps ESLint
    "prettier": "^3.0.0",
    "js-beautify": "^1.14.0",     // ❌ Overlaps Prettier
    "standard": "^17.0.0",        // ❌ Overlaps ESLint
    "xo": "^0.54.0",              // ❌ Overlaps ESLint
    "jest": "^29.0.0",
    "mocha": "^10.0.0",           // ❌ Two test runners
    "ava": "^5.0.0"               // ❌ Three test runners!
  }
}

Problems:
- Conflicting rules (which formatter wins?)
- Confusing (which linter to run?)
- Maintenance burden (update 3 test runners)

// ✅ GOOD: Focused toolset
{
  "devDependencies": {
    // Type checking
    "typescript": "^5.0.0",

    // Linting
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",

    // Formatting
    "prettier": "^3.0.0",
    "eslint-config-prettier": "^9.0.0",  // ✅ Prevent ESLint/Prettier conflicts

    // Testing
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0",

    // Build
    "tsx": "^4.0.0",  // Run TypeScript directly
    "tsc-alias": "^1.8.0"  // Resolve path aliases
  },

  "scripts": {
    "lint": "eslint . && prettier --check .",
    "lint:fix": "eslint . --fix && prettier --write .",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  }
}
```

### 4.7 CI Ergonomics
- [ ] Fast feedback (quick checks run first)?
- [ ] Parallelized jobs where possible?
- [ ] Clear failure messages in CI?
- [ ] Failed checks easy to reproduce locally?
- [ ] CI doesn't do things devs can't do locally?

**Red flags:**
- Slow CI (30+ minutes for basic checks)
- Serial execution (could parallelize)
- Cryptic CI failures
- Can't reproduce CI failures locally

**Fast CI feedback:**
```yaml
# ❌ BAD: Slow, serial CI (30 minutes)
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci                    # 2 min
      - run: npm run typecheck          # 1 min
      - run: npm run lint               # 2 min
      - run: npm test                   # 15 min
      - run: npm run build              # 5 min
      - run: npm run test:e2e           # 20 min ❌ Blocks everything

# Total: 45 minutes to get feedback

# ✅ GOOD: Fast, parallel CI (5 minutes)
jobs:
  # Fast checks (run first, fail fast)
  quick-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci

      # Parallel: Typecheck + Lint (2 min total)
      - name: Type check
        run: npm run typecheck &

      - name: Lint
        run: npm run lint &

      - name: Wait for checks
        run: wait

  # Unit tests (parallel with quick-check)
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          cache: 'npm'
      - run: npm ci
      - run: npm test  # 5 min (with coverage)

  # Build (parallel with tests)
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          cache: 'npm'
      - run: npm ci
      - run: npm run build  # 5 min

  # E2E tests (only if quick checks pass, slowest last)
  e2e:
    runs-on: ubuntu-latest
    needs: [quick-check, test, build]  # ✅ Wait for fast checks first
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:e2e  # 10 min

# Feedback timeline:
# - 2 min: Typecheck/lint results (fail fast)
# - 5 min: Unit tests pass
# - 5 min: Build succeeds
# - 10 min: E2E tests complete (only if others passed)
#
# Developer gets feedback in 2-5 minutes (not 45)
```

**Clear CI failures:**
```yaml
# ✅ GOOD: Annotate failures with helpful messages
- name: Type check
  run: npm run typecheck
  continue-on-error: false

- name: Lint
  run: npm run lint
  if: success() || failure()  # Run even if typecheck failed

- name: Test
  run: npm test
  if: success() || failure()

# GitHub Actions shows annotations inline:
# src/api/users.ts:45:12 - error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.

# Better: Add custom error formatting
- name: Type check
  run: |
    npm run typecheck || {
      echo "::error::Type check failed. Run 'npm run typecheck' locally to see errors."
      exit 1
    }
```

## Step 5: Generate Findings

For **each DX issue** found, create a finding with:

### Finding Format

```markdown
### DX-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.md:123` or `package.json:45`
```language
[exact content showing the issue]
```

**Developer Impact:**
- **Friction Point:** [What slows developers down?]
- **Time Lost:** [How much time wasted per developer?]
- **Onboarding Impact:** [Does this affect new developers?]
- **Frequency:** [How often is this encountered?]

**Developer Experience:**
```
Current experience:
1. Developer tries: [action]
2. Encounters: [problem]
3. Must: [workaround]
4. Time lost: [X minutes]

Improved experience:
1. Developer runs: [simple command]
2. Works immediately
3. Time saved: [X minutes]
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (poor DX)
[current setup]

// ✅ AFTER (improved DX)
[improved setup]
```

**Why This Fix:**
[Explain how this improves developer experience and productivity]
```

### Severity Guidelines

- **BLOCKER**: Cannot run/test project without significant manual work
  - Example: No setup instructions, broken scripts
  - Example: Can't reproduce prod/CI issues locally

- **HIGH**: Significant friction, wastes developer time daily
  - Example: 30-minute onboarding instead of 5 minutes
  - Example: No way to run tests locally

- **MED**: Moderate friction, causes occasional issues
  - Example: Unclear error messages
  - Example: Missing .env.example

- **LOW**: Minor inconvenience
  - Example: Could improve script naming
  - Example: Could add more debug logging

- **NIT**: Nice-to-have improvement
  - Example: Could add VS Code launch config

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with DX expectations:

1. **Check onboarding time**
   - Example: "5-minute onboarding goal" → current setup takes 30 min = BLOCKER

2. **Validate CI setup**
   - Example: "GitHub Actions CI" → check .github/workflows/ exists and works

3. **Verify local workflow**
   - Example: "Docker setup" → check docker-compose.yml works

## Step 7: DX Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER**:

1. **No README** or README missing setup instructions
2. **Broken setup** (documented steps don't work)
3. **No way to run tests** locally
4. **Can't reproduce CI failures** locally
5. **Missing .env.example** (must guess required env vars)
6. **No lockfile** (dependency versions not consistent)

## Step 8: Test Onboarding Experience

For `repo` scope, simulate new developer onboarding:

1. **Clone repository** (fresh checkout)
2. **Follow README** instructions exactly
3. **Time each step** (measure onboarding time)
4. **Note friction points** (where did you get stuck?)
5. **Check if app runs** (does it work after setup?)

**Onboarding checklist:**
```markdown
- [ ] README has clear setup instructions
- [ ] Prerequisites listed with versions
- [ ] Setup completes in <10 minutes
- [ ] App runs after setup (no additional config)
- [ ] Tests run successfully
- [ ] No manual database setup required
- [ ] Sample data provided
- [ ] Clear error messages if something fails
```

## Step 9: Write DX Report

Create `.claude/<SESSION_SLUG>/reviews/dx.md`:

```markdown
# Developer Experience (DX) Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## Onboarding Assessment

### Current Onboarding Time
[X minutes] from clone to running app

### Onboarding Steps
1. [Step 1]
2. [Step 2]
...

### Friction Points
1. [Main friction point]
2. [Second friction point]

### Target vs Actual
- **Target:** <from CONTEXT or estimate>
- **Actual:** <measured or estimated>
- **Gap:** <difference>

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## DX Improvements by Category

### Onboarding
- [Improvement 1]
- [Improvement 2]

### Commands & Scripts
- [Improvement 1]
- [Improvement 2]

### Configuration
- [Improvement 1]
- [Improvement 2]

### Debuggability
- [Improvement 1]
- [Improvement 2]

### CI/CD
- [Improvement 1]
- [Improvement 2]

---

## Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - must fix to unblock developers]

### Short-term (HIGH)
[Actions for HIGH items - significant time savings]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - incremental improvements]

---

## Estimated Time Savings

### Per Developer
- Onboarding: [X minutes saved]
- Daily workflow: [X minutes saved per day]
- Debugging: [X minutes saved per issue]

### Team (10 developers)
- Per week: [X hours saved]
- Per month: [X hours saved]
- Per year: [X hours saved]

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide DX context I may have missed
```

## Step 10: Output Summary

Print to console:

```
🔍 Developer Experience Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

⏱️  Onboarding time: X minutes (target: Y minutes)

📝 Full report: .claude/<SESSION_SLUG>/reviews/dx.md

⚠️  BLOCKER items: [list titles]
```

---

## Example Findings

[The examples would continue here with 5-7 detailed findings similar to previous review commands]

---

## Notes

- **Test the onboarding**: Actually follow setup instructions to find friction
- **Time measurements**: Measure how long things take (onboarding, commands)
- **Developer empathy**: Think from new developer's perspective
- **Evidence-first**: Every finding must have file:line + content snippet
- **Actionable remediation**: Provide complete before/after with clear improvements
- **Cross-reference CONTEXT**: Check against onboarding time goals and CI setup
- **False positives welcome**: Encourage users to challenge DX interpretations
