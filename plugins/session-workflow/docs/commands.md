# Complete Command Reference

This document provides a comprehensive reference for all 43 commands in the session-workflow plugin.

---

## Table of Contents

- [Code Review Commands (30)](#code-review-commands)
  - [Security & Privacy](#security--privacy)
  - [Performance](#performance)
  - [Accessibility](#accessibility)
  - [Architecture & Design](#architecture--design)
  - [Infrastructure & Operations](#infrastructure--operations)
  - [Observability](#observability)
  - [User Experience](#user-experience)
- [Operational Commands (10)](#operational-commands)
  - [Incident Response](#incident-response)
  - [Risk & Planning](#risk--planning)
  - [Deployment & Operations](#deployment--operations)
- [Workflow Commands (3)](#workflow-commands)
- [Setup Commands (1)](#setup-commands)

---

## Code Review Commands

All review commands follow this structure:

```bash
/review:<type>
TARGET: <file-or-directory>
DEPTH: <quick|thorough|paranoid>
FOCUS: <comma-separated-areas>
FRAMEWORKS: <comma-separated-frameworks>
```

### Security & Privacy

#### `/review:security`

**Purpose**: Review code for security vulnerabilities

**Parameters**:
- `TARGET`: File or directory to review
- `DEPTH`: `quick` (30min), `thorough` (2h), `paranoid` (1 day)
- `FOCUS`: `authentication`, `authorization`, `secrets`, `injection`, `xss`, `csrf`
- `FRAMEWORKS`: `express`, `fastify`, `koa`, `nestjs`

**Categories**:
- Authentication & Session Management
- Authorization & Access Control
- Input Validation & Sanitization
- Secret Management
- API Security
- Database Security
- Cryptography

**Example**:
```bash
/review:security
TARGET: src/api/
DEPTH: thorough
FOCUS: authentication,authorization,secrets
FRAMEWORKS: express
```

**Output**: Markdown report with BLOCKER/HIGH/MED/LOW findings, before/after code examples

---

#### `/review:api-contracts`

**Purpose**: Review API contract stability and versioning

**Parameters**:
- `TARGET`: API route files or OpenAPI specs
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `backwards-compat`, `versioning`, `deprecation`, `documentation`
- `API_STYLE`: `rest`, `graphql`, `grpc`

**Categories**:
- Backwards Compatibility
- API Versioning Strategy
- Deprecation Process
- Request/Response Schemas
- Error Response Contracts
- Documentation Quality

**Example**:
```bash
/review:api-contracts
TARGET: src/api/v2/
DEPTH: thorough
FOCUS: backwards-compat,versioning
API_STYLE: rest
```

---

#### `/review:infra-security`

**Purpose**: Review infrastructure security (IAM, network, secrets)

**Parameters**:
- `TARGET`: Terraform/K8s configs
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `iam`, `network`, `secrets`, `encryption`
- `INFRA_TYPE`: `terraform`, `kubernetes`, `cloudformation`, `pulumi`

**Categories**:
- IAM & Permissions
- Network Security
- Secret Management
- Encryption at Rest & In Transit
- Container Security
- Cloud Security Posture

**Example**:
```bash
/review:infra-security
TARGET: terraform/
DEPTH: paranoid
FOCUS: iam,secrets,encryption
INFRA_TYPE: terraform
```

---

#### `/review:data-integrity`

**Purpose**: Review data consistency and integrity

**Parameters**:
- `TARGET`: Database models, migrations, business logic
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `constraints`, `transactions`, `validation`, `consistency`
- `DATABASE`: `postgres`, `mysql`, `mongodb`, `dynamodb`

**Categories**:
- Data Constraints & Validation
- Transaction Boundaries
- Race Conditions
- Data Consistency
- Referential Integrity
- Audit Logging

**Example**:
```bash
/review:data-integrity
TARGET: src/models/,src/repositories/
DEPTH: thorough
FOCUS: transactions,consistency
DATABASE: postgres
```

---

### Performance

#### `/review:frontend-performance`

**Purpose**: Review frontend performance (bundle size, rendering, data fetching)

**Parameters**:
- `TARGET`: Frontend components and build config
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `bundle-size`, `rendering`, `data-fetching`, `images`, `main-thread`
- `FRAMEWORKS`: `react`, `vue`, `angular`, `webpack`, `vite`

**Categories**:
- Bundle Size & Code Splitting
- Rendering Performance
- Data Fetching Patterns
- Image & Asset Optimization
- Main Thread Performance
- State Management Performance
- SSR/Hydration

**Example**:
```bash
/review:frontend-performance
TARGET: src/components/,webpack.config.js
DEPTH: thorough
FOCUS: bundle-size,rendering,data-fetching
FRAMEWORKS: react,webpack
```

---

#### `/review:backend-concurrency`

**Purpose**: Review backend concurrency (race conditions, atomicity, locking)

**Parameters**:
- `TARGET`: Business logic with shared state
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `race-conditions`, `atomicity`, `locking`, `deadlocks`
- `CONCURRENCY_MODEL`: `async-await`, `promises`, `workers`, `threads`

**Categories**:
- Race Conditions
- Atomicity & Transactions
- Locking Strategies
- Deadlock Prevention
- Idempotency
- Queue Processing
- Distributed Systems Issues

**Example**:
```bash
/review:backend-concurrency
TARGET: src/services/payment.ts
DEPTH: paranoid
FOCUS: race-conditions,atomicity,idempotency
CONCURRENCY_MODEL: async-await
```

---

#### `/review:migrations`

**Purpose**: Review database migrations for safety

**Parameters**:
- `TARGET`: Migration files
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `downtime`, `data-loss`, `performance`, `rollback`
- `DATABASE`: `postgres`, `mysql`, `mongodb`

**Categories**:
- Zero-Downtime Migrations
- Data Loss Prevention
- Query Performance Impact
- Index Strategy
- Rollback Safety
- Expand/Contract Pattern

**Example**:
```bash
/review:migrations
TARGET: migrations/
DEPTH: paranoid
FOCUS: downtime,data-loss,performance
DATABASE: postgres
```

---

### Accessibility

#### `/review:accessibility`

**Purpose**: Review accessibility (WCAG 2.1 AA compliance)

**Parameters**:
- `TARGET`: UI components
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `keyboard`, `screen-reader`, `color-contrast`, `focus`, `aria`
- `FRAMEWORKS`: `react`, `vue`, `angular`, `html`

**Categories**:
- Semantic HTML
- Keyboard Navigation
- Screen Reader Support
- Color Contrast & Visual Design
- Focus Management
- ARIA Attributes
- Forms & Validation

**Example**:
```bash
/review:accessibility
TARGET: src/components/
DEPTH: thorough
FOCUS: keyboard,screen-reader,aria
FRAMEWORKS: react
```

---

#### `/review:frontend-accessibility`

**Purpose**: Frontend-specific accessibility for SPAs

**Parameters**:
- `TARGET`: SPA components and routing
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `route-announcements`, `dynamic-content`, `client-side-routing`
- `FRAMEWORKS`: `react`, `vue`, `angular`

**Categories**:
- Client-Side Routing Announcements
- Dynamic Content Updates
- Focus Management in SPAs
- Modal & Dialog Accessibility
- Loading States
- Error Announcements

**Example**:
```bash
/review:frontend-accessibility
TARGET: src/app/,src/components/
DEPTH: thorough
FOCUS: route-announcements,dynamic-content
FRAMEWORKS: react
```

---

### Architecture & Design

#### `/review:dx`

**Purpose**: Review developer experience and API ergonomics

**Parameters**:
- `TARGET`: Public APIs, SDKs, libraries
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `ergonomics`, `discoverability`, `error-messages`, `documentation`
- `API_TYPE`: `rest`, `graphql`, `sdk`, `library`

**Categories**:
- API Ergonomics
- Discoverability
- Error Messages
- TypeScript Types
- Documentation
- Examples & Guides
- Onboarding Experience

**Example**:
```bash
/review:dx
TARGET: src/sdk/,docs/
DEPTH: thorough
FOCUS: ergonomics,error-messages,documentation
API_TYPE: sdk
```

---

#### `/review:refactor-safety`

**Purpose**: Hunt semantic drift in refactors

**Parameters**:
- `TARGET`: Refactored code
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `behavior-changes`, `edge-cases`, `error-handling`, `side-effects`
- `REFACTOR_TYPE`: `rename`, `extract`, `inline`, `restructure`

**Categories**:
- Unintended Behavior Changes
- Edge Case Handling
- Error Handling Changes
- Side Effect Changes
- Performance Regressions
- API Surface Changes

**Example**:
```bash
/review:refactor-safety
TARGET: src/services/payment.ts
DEPTH: paranoid
FOCUS: behavior-changes,edge-cases,error-handling
REFACTOR_TYPE: restructure
```

---

### Infrastructure & Operations

#### `/review:infra`

**Purpose**: Review infrastructure (IAM, network, compute, availability)

**Parameters**:
- `TARGET`: Infrastructure as Code files
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `iam`, `network`, `compute`, `availability`, `cost`, `observability`
- `INFRA_TYPE`: `terraform`, `kubernetes`, `cloudformation`, `pulumi`

**Categories**:
- IAM & Permissions
- Network Architecture
- Secret Management
- Compute Resources
- Availability & Redundancy
- Disaster Recovery
- Cost Optimization
- Observability

**Example**:
```bash
/review:infra
TARGET: terraform/,k8s/
DEPTH: thorough
FOCUS: iam,network,availability
INFRA_TYPE: terraform,kubernetes
```

---

#### `/review:ci`

**Purpose**: Review CI/CD pipelines

**Parameters**:
- `TARGET`: CI/CD config files
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `correctness`, `determinism`, `caching`, `secrets`, `parallelization`
- `CI_PLATFORM`: `github-actions`, `gitlab-ci`, `circleci`, `jenkins`

**Categories**:
- Correctness & Completeness
- Determinism & Reproducibility
- Caching Strategy
- Secret Management
- Parallelization & Speed
- Failure Handling
- Security Scanning

**Example**:
```bash
/review:ci
TARGET: .github/workflows/
DEPTH: thorough
FOCUS: correctness,caching,secrets
CI_PLATFORM: github-actions
```

---

#### `/review:release`

**Purpose**: Review release engineering (versioning, changelog, rollout)

**Parameters**:
- `TARGET`: Release process documentation and scripts
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `versioning`, `changelog`, `rollout`, `rollback`, `communication`
- `RELEASE_TYPE`: `semver`, `calver`, `continuous`

**Categories**:
- Versioning Strategy
- Changelog Quality
- Rollout Strategy
- Rollback Procedures
- Release Communication
- Feature Flags
- Monitoring & Alerting

**Example**:
```bash
/review:release
TARGET: docs/release-process.md,scripts/release.sh
DEPTH: thorough
FOCUS: versioning,rollout,rollback
RELEASE_TYPE: semver
```

---

### Observability

#### `/review:logging`

**Purpose**: Review logging for safety, privacy, quality, noise

**Parameters**:
- `TARGET`: Code with logging statements
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `safety`, `privacy`, `quality`, `levels`, `noise`, `structure`
- `LOGGER`: `pino`, `winston`, `bunyan`, `console`

**Categories**:
- Safety (no secrets, no sensitive data)
- Privacy (PII redaction, GDPR compliance)
- Quality (structured, queryable, contextual)
- Log Levels (appropriate severity)
- Noise Reduction (tail sampling, rate limiting)
- Structure (consistent format, parseable)

**Example**:
```bash
/review:logging
TARGET: src/
DEPTH: thorough
FOCUS: safety,privacy,noise
LOGGER: pino
```

---

#### `/review:observability`

**Purpose**: Comprehensive observability review

**Parameters**:
- `TARGET`: Application code and observability config
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `logs`, `metrics`, `tracing`, `errors`, `alerts`, `runbooks`
- `OBSERVABILITY_STACK`: `datadog`, `newrelic`, `grafana`, `cloudwatch`

**Categories**:
- Logs (wide events, tail sampling)
- Metrics (business and technical)
- Distributed Tracing
- Error Reporting
- Alertability (SLI-based alerts)
- Runbooks (linked from alerts)

**Example**:
```bash
/review:observability
TARGET: src/,datadog/
DEPTH: thorough
FOCUS: logs,metrics,alerts
OBSERVABILITY_STACK: datadog
```

---

### User Experience

#### `/review:ux-copy`

**Purpose**: Review UX copy clarity, actionability, consistency

**Parameters**:
- `TARGET`: UI components with user-facing text
- `DEPTH`: `quick`, `thorough`, `paranoid`
- `FOCUS`: `clarity`, `actionability`, `consistency`, `tone`, `i18n`, `errors`, `success`
- `FRAMEWORKS`: `react`, `vue`, `angular`

**Categories**:
- Clarity & Conciseness
- Actionability (clear CTAs)
- Consistency (voice and terminology)
- Tone & Brand Alignment
- Internationalization (i18n)
- Error Messages
- Success Feedback

**Example**:
```bash
/review:ux-copy
TARGET: src/components/
DEPTH: thorough
FOCUS: clarity,actionability,errors
FRAMEWORKS: react
```

---

## Operational Commands

### Incident Response

#### `/repro-harness`

**Purpose**: Create bug reproduction harness with deterministic tests

**Parameters**:
- `BUG_REPORT`: Description of bug
- `TARGET`: Code area to investigate
- `FRAMEWORKS`: `express`, `react`, `stripe`, etc.
- `REPRODUCTION_STYLE`: `unit-test`, `integration-test`, `e2e-test`, `manual-steps`

**Workflow**:
1. Parse bug report
2. Identify reproduction conditions
3. Create minimal reproduction
4. Write deterministic test
5. Verify bug reproduces
6. Document environment requirements
7. Create test fixtures
8. Add test to CI
9. Verify fix validation
10. Document reproduction steps

**Example**:
```bash
/repro-harness
BUG_REPORT: "Users report checkout timeout after 30s when cart has > 100 items"
TARGET: src/checkout/
FRAMEWORKS: express,stripe
REPRODUCTION_STYLE: integration-test
```

**Output**: Runnable test file that reproduces bug 100% of the time

---

#### `/rca`

**Purpose**: Root cause analysis with 5 Whys methodology

**Parameters**:
- `INCIDENT`: Incident title/description
- `DURATION`: Incident duration
- `IMPACT`: Users affected, business impact
- `TIMELINE`: "HH:MM - Event description" entries
- `METHODOLOGY`: `five-whys`, `fishbone`, `timeline`

**Workflow**:
1. Gather incident data
2. Create timeline
3. Identify symptoms
4. Perform 5 Whys
5. Identify contributing factors
6. Assess blast radius
7. Determine root cause
8. Identify near-misses
9. Create summary
10. Generate action categories

**Example**:
```bash
/rca
INCIDENT: "2025-01-15 Checkout Timeout Incident"
DURATION: 45min
IMPACT: 2500 users affected, $45k GMV lost
TIMELINE: |
  14:30 - First reports of slow checkout
  14:45 - Error rate spike to 20%
  15:00 - Database query identified (30s timeout)
  15:15 - Index added, recovery begins
METHODOLOGY: five-whys
```

**Output**: Complete RCA document with root cause, contributing factors, and action categories

---

#### `/postmortem-actions`

**Purpose**: Convert RCA to trackable action items

**Parameters**:
- `RCA`: RCA document or link
- `SCOPE`: `service`, `team`, `org`
- `PRIORITIZATION`: `impact-first`, `effort-first`, `balanced`
- `CAPACITY`: `low`, `medium`, `high`
- `OWNERSHIP_MODEL`: `direct-owner`, `module-owners`, `team-rotation`
- `TRACKING_SYSTEM`: `jira`, `linear`, `github`, `none`
- `DUE_DATE_POLICY`: `aggressive`, `realistic`, `none`

**Workflow**:
1. Extract failure modes from RCA
2. Generate prevention actions
3. Generate detection actions
4. Generate response actions
5. Generate process actions
6. Generate reliability actions
7. Generate security/privacy actions (if applicable)
8. Prioritize actions (P0/P1/P2/P3)
9. Assign ownership
10. Create tracking tickets

**Action Categories**:
- **Prevention**: Code/design guardrails
- **Detection**: Alerts, dashboards, monitoring
- **Response**: Runbooks, automation
- **Process**: Review gates, CI checks
- **Reliability**: Timeouts, retries, circuit breakers
- **Security/Privacy**: If incident involved these

**Example**:
```bash
/postmortem-actions
RCA: <paste /rca output>
SCOPE: service
PRIORITIZATION: balanced
CAPACITY: medium
OWNERSHIP_MODEL: module-owners
TRACKING_SYSTEM: jira
DUE_DATE_POLICY: realistic
```

**Output**: Prioritized action plan with owners, "done when" criteria, and due dates

---

### Risk & Planning

#### `/risk-assess`

**Purpose**: Release risk assessment

**Parameters**:
- `RELEASE`: Release version/name
- `CHANGES`: Comma-separated list of changes
- `ENVIRONMENT`: `staging`, `production`
- `RISK_APPETITE`: `low`, `medium`, `high`
- `ASSESSMENT_DEPTH`: `quick`, `thorough`, `paranoid`

**Workflow**:
1. Identify changes
2. Classify change types
3. Assess technical risk
4. Assess business risk
5. Identify blast radius
6. Calculate risk score
7. Recommend mitigations
8. Create risk register
9. Generate go/no-go recommendation
10. Document rollback plan

**Example**:
```bash
/risk-assess
RELEASE: v2.5.0
CHANGES: payment-api-v2,new-checkout-flow,database-migration
ENVIRONMENT: production
RISK_APPETITE: low
ASSESSMENT_DEPTH: thorough
```

**Output**: Risk register with likelihood × impact scores and mitigation recommendations

---

#### `/compat-check`

**Purpose**: API/database/event compatibility checking

**Parameters**:
- `CHANGE_TYPE`: `api`, `database`, `events`, `dependencies`
- `OLD_VERSION`: Current version/schema
- `NEW_VERSION`: Proposed version/schema
- `COMPATIBILITY_LEVEL`: `strict`, `moderate`, `loose`

**Workflow**:
1. Identify change type
2. Parse old version
3. Parse new version
4. Compare schemas
5. Detect breaking changes
6. Assess compatibility impact
7. Recommend migration strategy
8. Generate compatibility report
9. Create test plan
10. Document upgrade path

**Example**:
```bash
/compat-check
CHANGE_TYPE: api,database
OLD_VERSION: v2.4.0
NEW_VERSION: v2.5.0
COMPATIBILITY_LEVEL: strict
```

**Output**: Compatibility report with breaking changes and migration strategy

---

#### `/test-matrix`

**Purpose**: Behavior-driven test strategy design

**Parameters**:
- `TARGET`: Feature or system to test
- `RISK_LEVEL`: `low`, `medium`, `high`, `critical`
- `COVERAGE_GOAL`: Percentage (e.g., 80, 95)
- `TEST_TYPES`: `unit`, `integration`, `e2e`, `chaos`, `load`

**Workflow**:
1. Analyze feature requirements
2. Identify critical paths
3. Identify edge cases
4. Map test types to scenarios
5. Design unit test strategy
6. Design integration test strategy
7. Design e2e test strategy
8. Design chaos tests (if high risk)
9. Create test matrix
10. Estimate coverage

**Example**:
```bash
/test-matrix
TARGET: Payment API v2 migration
RISK_LEVEL: high
COVERAGE_GOAL: 95
TEST_TYPES: unit,integration,e2e,chaos
```

**Output**: Test matrix with scenarios, test types, and coverage estimates

---

### Deployment & Operations

#### `/ship-plan`

**Purpose**: Staged rollout planning

**Parameters**:
- `RELEASE`: Release version/name
- `ROLLOUT_STYLE`: `canary`, `blue-green`, `rolling`, `all-at-once`
- `TRAFFIC_PATTERN`: Comma-separated percentages (e.g., 1,10,50,100)
- `FEATURE_FLAGS`: Comma-separated flag names
- `ROLLBACK_TRIGGERS`: Error rate, latency, custom metrics

**Workflow**:
1. Analyze release changes
2. Choose rollout style
3. Design traffic progression
4. Define success criteria per phase
5. Define rollback triggers
6. Create monitoring plan
7. Document deployment steps
8. Document rollback procedure
9. Create communication plan
10. Generate rollout timeline

**Example**:
```bash
/ship-plan
RELEASE: v2.5.0
ROLLOUT_STYLE: canary
TRAFFIC_PATTERN: 1,10,50,100
FEATURE_FLAGS: new_checkout_flow,payment_api_v2
ROLLBACK_TRIGGERS: error_rate>0.01,p95_latency>2000
```

**Output**: Detailed rollout plan with phases, success criteria, and rollback procedures

---

#### `/prod-readiness`

**Purpose**: Production readiness "2am debug story" review

**Parameters**:
- `SERVICE`: Service name
- `DEPLOYMENT_ENVIRONMENT`: `staging`, `production`
- `READINESS_LEVEL`: `mvp`, `production`, `critical`
- `FOCUS`: `monitoring`, `runbooks`, `scaling`, `disaster-recovery`

**Workflow**:
1. Test "2am debug story"
2. Review monitoring coverage
3. Review alerting configuration
4. Review runbook completeness
5. Review scaling capabilities
6. Review disaster recovery
7. Review security posture
8. Review compliance requirements
9. Create readiness scorecard
10. Generate recommendations

**Example**:
```bash
/prod-readiness
SERVICE: payment-api
DEPLOYMENT_ENVIRONMENT: production
READINESS_LEVEL: critical
FOCUS: monitoring,runbooks,disaster-recovery
```

**Output**: Production readiness scorecard with pass/fail items and recommendations

---

#### `/telemetry-audit`

**Purpose**: Telemetry PII/cardinality/cost audit

**Parameters**:
- `TARGET`: Code with telemetry
- `AUDIT_FOCUS`: `pii`, `cardinality`, `cost`, `coverage`
- `TELEMETRY_SYSTEM`: `datadog`, `newrelic`, `grafana`, `cloudwatch`
- `COMPLIANCE_REQUIREMENTS`: `gdpr`, `hipaa`, `pci-dss`, `none`

**Workflow**:
1. Scan for PII in logs/metrics
2. Analyze metric cardinality
3. Estimate cost impact
4. Review coverage gaps
5. Check compliance violations
6. Identify optimization opportunities
7. Generate findings report
8. Recommend redaction strategies
9. Recommend aggregation strategies
10. Create action plan

**Example**:
```bash
/telemetry-audit
TARGET: src/
AUDIT_FOCUS: pii,cardinality,cost
TELEMETRY_SYSTEM: datadog
COMPLIANCE_REQUIREMENTS: gdpr
```

**Output**: Telemetry audit report with PII violations, high-cardinality metrics, and cost estimates

---

#### `/debt-register`

**Purpose**: Technical debt backlog with priority matrix

**Parameters**:
- `SCOPE`: `service`, `team`, `org`
- `DEBT_SOURCES`: `code`, `architecture`, `process`, `infrastructure`, `documentation`
- `PRIORITIZATION`: `impact-first`, `effort-first`, `balanced`
- `TIME_HORIZON`: `sprint`, `quarter`, `year`

**Workflow**:
1. Scan for technical debt
2. Categorize debt items
3. Assess impact (high/med/low)
4. Estimate effort (S/M/L)
5. Calculate priority (P0/P1/P2/P3)
6. Map to time horizons
7. Create debt register
8. Generate roadmap
9. Assign owners
10. Track progress

**Example**:
```bash
/debt-register
SCOPE: team
DEBT_SOURCES: code,architecture,infrastructure
PRIORITIZATION: balanced
TIME_HORIZON: quarter
```

**Output**: Technical debt register with prioritized backlog and roadmap

---

#### `/refactor-followups`

**Purpose**: Staged refactor planning

**Parameters**:
- `REFACTOR_TARGET`: System to refactor
- `REFACTOR_TYPE`: `extract`, `inline`, `rename`, `restructure`, `replace`
- `RISK_LEVEL`: `low`, `medium`, `high`
- `PARALLEL_WORK`: `yes`, `no`

**Workflow**:
1. Analyze refactor scope
2. Identify dependencies
3. Design refactor phases
4. Create compatibility layer (if needed)
5. Plan parallel work (old + new)
6. Design migration path
7. Create test strategy
8. Define completion criteria
9. Create rollback plan
10. Generate phase timeline

**Example**:
```bash
/refactor-followups
REFACTOR_TARGET: Authentication system
REFACTOR_TYPE: replace
RISK_LEVEL: high
PARALLEL_WORK: yes
```

**Output**: Staged refactor plan with phases, compatibility layer, and migration strategy

---

## Workflow Commands

### `/handoff`

**Purpose**: Handoff documentation for different audiences

**Parameters**:
- `AUDIENCE`: `reviewers`, `oncall`, `cross-functional`, `leadership`
- `CHANGE`: Change description
- `CRITICAL_PATHS`: Comma-separated critical flows
- `ROLLBACK_PLAN`: `feature-flag`, `deployment-rollback`, `database-rollback`, `manual`

**Audiences**:

#### Reviewers
- Where to start reviewing
- Highest-risk areas
- Test commands to run
- Expected behavior changes

#### Oncall
- Deployment steps
- Monitoring dashboards
- Rollback procedures
- Known issues and workarounds

#### Cross-functional
- Business objectives
- Timeline and milestones
- Dependencies and blockers
- Success metrics

#### Leadership
- Strategic impact
- Resource requirements
- Risk summary
- ROI and business value

**Example**:
```bash
/handoff
AUDIENCE: oncall
CHANGE: "Payment API v2 migration"
CRITICAL_PATHS: checkout,subscriptions,refunds
ROLLBACK_PLAN: feature-flag
```

**Output**: Tailored handoff document for specified audience

---

### `/close-session`

**Purpose**: Session closure with artifact tracking

**Parameters**:
- `SESSION_SLUG`: Kebab-case session identifier
- `STATUS`: `Done`, `Paused`, `Abandoned`
- `OUTCOME`: 1-3 sentence summary
- `PR_OR_COMMIT`: PR URLs or commit hashes
- `ROLL_OUT`: `none`, `canary`, `phased`, `full`
- `FOLLOW_UPS`: Remaining work with owners
- `ARTIFACTS_COMPLETED`: Key files created/updated

**Workflow**:
1. Validate SESSION_SLUG format
2. Check for existing session directory
3. Update session README
4. Update global session index
5. Produce closure summary

**Example**:
```bash
/close-session
SESSION_SLUG: payment-api-v2
STATUS: Done
OUTCOME: "Completed payment API migration with 95% test coverage. Ready for staging deployment."
PR_OR_COMMIT: https://github.com/org/repo/pull/456
ROLL_OUT: phased
FOLLOW_UPS:
  - Add rate limiting (@security team)
  - Load test with 10k req/s (@platform team)
ARTIFACTS_COMPLETED:
  - src/payment/stripe-v2.ts - Stripe v2 client
  - tests/payment/stripe-v2.test.ts - Integration tests
```

**Output**: Updated session README, global index, and closure summary

---

## Setup Commands

### `/setup-wide-logging`

**Purpose**: Implement wide-event observability

**Parameters**:
- `FRAMEWORK`: `express`, `fastify`, `koa`, `nestjs`
- `LOGGER`: `pino`, `winston`, `bunyan`
- `TAIL_SAMPLE_RATE`: Decimal (0.01-0.10, default 0.05)
- `BUSINESS_CONTEXT`: Comma-separated context fields
- `KEEP_ALWAYS`: Comma-separated conditions to always keep

**Workflow**:
1. Auto-detect framework
2. Install logger dependencies
3. Create wide-event interface
4. Implement tail sampling function
5. Create middleware
6. Add business context enrichment
7. Configure output destination
8. Add to application
9. Create usage examples
10. Verify implementation

**Example**:
```bash
/setup-wide-logging
FRAMEWORK: express
LOGGER: pino
TAIL_SAMPLE_RATE: 0.05
BUSINESS_CONTEXT: user.id,user.subscription,user.ltv,cart.total
KEEP_ALWAYS: status>=500,duration>2000,user.subscription=enterprise
```

**Output**: Complete wide-event logging implementation with middleware, sampling, and examples

---

## Summary Statistics

| Category | Commands | Total Lines |
|----------|----------|-------------|
| Code Review | 30 | ~55,000 |
| Operational | 10 | ~14,000 |
| Workflow | 3 | ~10,000 |
| Setup | 1 | ~2,300 |
| **Total** | **43** | **~81,300** |

Each command includes:
- YAML frontmatter
- Parameter guide
- 10-step workflow
- 4-7 category checklists
- 3-5 detailed examples
- Before/after code
- Output template

---

**Next**: See [Workflow Guide](workflows.md) for end-to-end usage scenarios
