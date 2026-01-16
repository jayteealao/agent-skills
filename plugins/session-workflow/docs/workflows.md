# Complete Workflow Guide

This guide demonstrates end-to-end workflows for common software engineering scenarios using the session-workflow plugin.

---

## Table of Contents

- [Code Review Workflows](#code-review-workflows)
- [Observability Setup Workflow](#observability-setup-workflow)
- [Incident Response Workflow](#incident-response-workflow)
- [Deployment Workflow](#deployment-workflow)
- [Refactoring Workflow](#refactoring-workflow)
- [Session Management Workflow](#session-management-workflow)

---

## Code Review Workflows

### Workflow 1: Pre-Merge Security Review

**Scenario**: Review PR for security vulnerabilities before merging to main

**Steps**:

```bash
# 1. Security review
/review:security
TARGET: src/api/auth/
DEPTH: thorough
FOCUS: authentication,authorization,secrets
FRAMEWORKS: express

# 2. If API changes detected, check contracts
/review:api-contracts
TARGET: src/api/auth/routes.ts
DEPTH: thorough
FOCUS: backwards-compat,versioning
API_STYLE: rest

# 3. If database changes, review migrations
/review:migrations
TARGET: migrations/20250115_add_mfa.sql
DEPTH: paranoid
FOCUS: downtime,data-loss,rollback
DATABASE: postgres

# 4. Review logging for sensitive data
/review:logging
TARGET: src/api/auth/
DEPTH: thorough
FOCUS: safety,privacy
LOGGER: pino
```

**Expected Output**:
- Security findings report (BLOCKER/HIGH must be fixed)
- API compatibility report (breaking changes flagged)
- Migration safety assessment
- Logging safety report (no secrets/PII exposed)

**Decision Gate**:
- ✅ **Merge if**: No BLOCKER findings, HIGH findings addressed
- ❌ **Block if**: BLOCKER findings exist, breaking API changes without versioning

---

### Workflow 2: Frontend Performance Review

**Scenario**: Review React app for performance issues

**Steps**:

```bash
# 1. Frontend performance review
/review:frontend-performance
TARGET: src/components/,webpack.config.js
DEPTH: thorough
FOCUS: bundle-size,rendering,data-fetching
FRAMEWORKS: react,webpack

# 2. Accessibility review (performance affects a11y)
/review:accessibility
TARGET: src/components/
DEPTH: thorough
FOCUS: keyboard,screen-reader,focus
FRAMEWORKS: react

# 3. UX copy review (while reviewing components)
/review:ux-copy
TARGET: src/components/
DEPTH: quick
FOCUS: clarity,actionability,errors
FRAMEWORKS: react
```

**Expected Output**:
- Bundle size analysis (target: < 250KB initial bundle)
- Rendering performance findings (unnecessary re-renders)
- Data fetching patterns (N+1 queries, waterfalls)
- Accessibility findings (WCAG 2.1 AA compliance)
- UX copy improvements

**Action Items**:
- Code-split large dependencies (e.g., moment.js → date-fns)
- Memoize expensive computations
- Implement virtualization for long lists
- Add proper ARIA labels
- Improve error messages

---

### Workflow 3: Infrastructure Review

**Scenario**: Review Terraform changes for new AWS infrastructure

**Steps**:

```bash
# 1. Infrastructure review
/review:infra
TARGET: terraform/
DEPTH: paranoid
FOCUS: iam,network,availability
INFRA_TYPE: terraform

# 2. Infrastructure security deep dive
/review:infra-security
TARGET: terraform/
DEPTH: paranoid
FOCUS: iam,secrets,encryption
INFRA_TYPE: terraform

# 3. CI/CD pipeline review (deployment automation)
/review:ci
TARGET: .github/workflows/terraform-deploy.yml
DEPTH: thorough
FOCUS: secrets,determinism
CI_PLATFORM: github-actions
```

**Expected Output**:
- IAM permissions review (principle of least privilege)
- Network security review (security groups, NACLs)
- Secrets management review (no hardcoded secrets)
- Availability review (multi-AZ, auto-scaling)
- CI/CD security review (secret handling)

**Critical Findings to Address**:
- BLOCKER: Wildcard IAM permissions
- BLOCKER: Public database access
- BLOCKER: Hardcoded secrets
- HIGH: Single-AZ deployment (no failover)
- HIGH: Secrets in CI logs

---

## Observability Setup Workflow

### Workflow: Implement Wide-Event Logging

**Scenario**: Migrate from scattered logs to wide-event observability

**Steps**:

```bash
# 1. Learn wide-event philosophy
claude --skill wide-event-observability "Design logging for payment API"

# 2. Implement wide-event logging
/setup-wide-logging
FRAMEWORK: express
LOGGER: pino
TAIL_SAMPLE_RATE: 0.05
BUSINESS_CONTEXT: user.id,user.subscription,user.ltv,cart.total,cart.item_count
KEEP_ALWAYS: status>=500,duration>2000,user.subscription=enterprise,feature_flags.new_checkout

# 3. Review existing logging for issues
/review:logging
TARGET: src/
DEPTH: thorough
FOCUS: safety,privacy,noise,structure
LOGGER: pino

# 4. Complete observability review
/review:observability
TARGET: src/,datadog/
DEPTH: thorough
FOCUS: logs,metrics,alerts,runbooks
OBSERVABILITY_STACK: datadog

# 5. Audit telemetry for PII and cost
/telemetry-audit
TARGET: src/
AUDIT_FOCUS: pii,cardinality,cost
TELEMETRY_SYSTEM: datadog
COMPLIANCE_REQUIREMENTS: gdpr
```

**Implementation Timeline**:

| Week | Task | Deliverable |
|------|------|-------------|
| 1 | Implement wide-event middleware | Middleware deployed to 1 service |
| 2 | Review and fix logging issues | No secrets/PII in logs |
| 3 | Roll out to all services | All services using wide events |
| 4 | Add metrics and alerts | Complete observability |
| 5 | Audit and optimize | GDPR compliant, cost optimized |

**Expected Results**:
- **Cost**: 90% reduction in log volume
- **Signal**: 100% of errors/slow/VIPs captured
- **Queryability**: SQL queries instead of grep
- **Business context**: Every log has user tier, LTV, feature flags
- **Compliance**: PII redacted, GDPR compliant

---

## Incident Response Workflow

### Workflow: Complete Incident Response

**Scenario**: Production incident - checkout timeouts

**Timeline**:

```
14:30 - Users report slow checkout
14:45 - Error rate spikes to 20%
15:00 - Database query identified (30s timeout)
15:15 - Index added, recovery begins
15:30 - Incident resolved
```

**Steps**:

```bash
# 1. Create reproduction harness (during incident)
/repro-harness
BUG_REPORT: "Checkout times out after 30s when user email requires JOIN query"
TARGET: src/checkout/
FRAMEWORKS: express,stripe
REPRODUCTION_STYLE: integration-test

# Output: Deterministic test that reproduces timeout 100% of the time

# 2. Root cause analysis (after incident)
/rca
INCIDENT: "2025-01-15 Checkout Timeout Incident"
DURATION: 60min
IMPACT: 2500 users affected, $45k GMV lost
TIMELINE: |
  14:30 - First user reports slow checkout (support ticket)
  14:45 - Error rate spike to 20% (Datadog alert)
  14:50 - Oncall investigates, finds slow query in logs
  15:00 - Database query identified: JOIN on users.email without index
  15:15 - Index added via migration, query time drops to 50ms
  15:30 - Error rate returns to baseline
METHODOLOGY: five-whys

# Output: Complete RCA with 5 Whys, root cause, contributing factors

# 3. Convert RCA to action plan
/postmortem-actions
RCA: <paste /rca output>
SCOPE: service
PRIORITIZATION: balanced
CAPACITY: medium
OWNERSHIP_MODEL: module-owners
TRACKING_SYSTEM: jira
DUE_DATE_POLICY: realistic

# Output: 7 action items (3 P0, 2 P1, 2 P2)
#   P0:
#     - Add index on users.email (@alice, Due: 1 week)
#     - Alert on p95 query latency > 1s (@bob, Due: 1 week)
#     - Add migration review checklist (@charlie, Due: 2 weeks)
#   P1:
#     - Create DB performance runbook (@alice, Due: 3 weeks)
#     - Add 10s timeout to orders query (@bob, Due: 3 weeks)
#   P2:
#     - Add slow query dashboard (@charlie, Due: 6 weeks)
#     - Add chaos test for slow queries (@alice, Due: 6 weeks)
```

**Validation**:

```bash
# After fixes deployed, validate with load test
artillery run tests/load/checkout.yml

# Verify:
# - p95 query latency < 100ms ✅
# - Alert fires when slow query simulated ✅
# - Runbook tested by oncall ✅
# - Chaos test passes ✅
```

**Outcome**:
- **MTTR improvement**: 60min → 15min (4x faster)
- **Detection improvement**: 45min lag → 5min alert
- **Prevention**: Migration review checklist prevents recurrence

---

## Deployment Workflow

### Workflow: Safe Production Deployment

**Scenario**: Deploy payment API v2 to production

**Steps**:

```bash
# 1. Risk assessment
/risk-assess
RELEASE: v2.5.0
CHANGES: payment-api-v2,new-checkout-flow,database-migration,stripe-v2-upgrade
ENVIRONMENT: production
RISK_APPETITE: low
ASSESSMENT_DEPTH: thorough

# Output: Risk score 7.5/10 (HIGH RISK)
#   - Payment API changes (CRITICAL PATH)
#   - Database migration (POTENTIAL DOWNTIME)
#   - Third-party API upgrade (EXTERNAL DEPENDENCY)
# Recommendation: Use canary rollout with feature flags

# 2. Compatibility check
/compat-check
CHANGE_TYPE: api,database
OLD_VERSION: v2.4.0
NEW_VERSION: v2.5.0
COMPATIBILITY_LEVEL: strict

# Output: 2 breaking changes detected
#   - API: POST /api/checkout response schema changed
#   - Database: orders.payment_method ENUM changed
# Recommendation: Add expand/contract migration phase

# 3. Test strategy
/test-matrix
TARGET: Payment API v2 migration
RISK_LEVEL: high
COVERAGE_GOAL: 95
TEST_TYPES: unit,integration,e2e,chaos,load

# Output: Test matrix with 45 test scenarios
#   - 25 unit tests (happy paths, edge cases, errors)
#   - 10 integration tests (Stripe, database, queue)
#   - 5 e2e tests (full checkout flow)
#   - 3 chaos tests (Stripe timeout, DB failure, queue backlog)
#   - 2 load tests (1000 req/s, 10000 req/s)

# 4. Production readiness review
/prod-readiness
SERVICE: payment-api
DEPLOYMENT_ENVIRONMENT: production
READINESS_LEVEL: critical
FOCUS: monitoring,runbooks,disaster-recovery

# Output: Readiness score 85/100 (PASS with conditions)
#   ✅ Monitoring: Complete (logs, metrics, traces, alerts)
#   ✅ Runbooks: Complete (deployment, rollback, common issues)
#   ⚠️ Disaster recovery: Manual (recommend automated DB backup restore)
#   ✅ "2am debug story": PASS (oncall can diagnose without help)

# 5. Rollout plan
/ship-plan
RELEASE: v2.5.0
ROLLOUT_STYLE: canary
TRAFFIC_PATTERN: 1,10,50,100
FEATURE_FLAGS: new_checkout_flow,payment_api_v2
ROLLBACK_TRIGGERS: error_rate>0.01,p95_latency>2000,stripe_error_rate>0.05

# Output: 4-phase rollout plan
#   Phase 1: Canary 1% (30 minutes, 500 req/min)
#     Success: error_rate < 0.1%, p95 < 500ms, no customer complaints
#   Phase 2: 10% (1 hour, 5000 req/min)
#     Success: error_rate < 0.1%, p95 < 500ms, GMV ±5% of baseline
#   Phase 3: 50% (2 hours, 25000 req/min)
#     Success: error_rate < 0.1%, p95 < 500ms, GMV within ±3%
#   Phase 4: 100% (after 24h stability)

# 6. Telemetry audit (before deployment)
/telemetry-audit
TARGET: src/payment/
AUDIT_FOCUS: pii,cost
TELEMETRY_SYSTEM: datadog
COMPLIANCE_REQUIREMENTS: pci-dss

# Output: 3 findings
#   - BLOCKER: Credit card numbers in logs (src/payment/stripe.ts:45)
#   - HIGH: Unredacted email in error events (src/payment/errors.ts:23)
#   - MEDIUM: High-cardinality metric (stripe_charge_id label, 10M unique values)
# Action: Fix before deployment

# 7. Handoff to oncall
/handoff
AUDIENCE: oncall
CHANGE: "Payment API v2 migration with Stripe API upgrade"
CRITICAL_PATHS: checkout,subscriptions,refunds
ROLLBACK_PLAN: feature-flag

# Output: Oncall handoff document
#   - Deployment steps (6 steps, ~15 minutes)
#   - Monitoring dashboard link
#   - Rollback procedure (< 5 minutes)
#   - Known issues and workarounds
#   - Escalation contacts
```

**Execution Timeline**:

| Time | Action | Success Criteria |
|------|--------|------------------|
| T+0 | Deploy to canary (1%) | Error rate < 0.1%, P95 < 500ms |
| T+30min | Promote to 10% | No regressions, GMV ±5% |
| T+90min | Promote to 50% | No regressions, GMV ±3% |
| T+3h | Hold at 50% for 24h | Stability validation |
| T+27h | Promote to 100% | Full rollout |

**Rollback Triggers** (automatic):
- Error rate > 1% for 5 minutes
- P95 latency > 2s for 10 minutes
- Stripe error rate > 5%
- Manual rollback by oncall

---

## Refactoring Workflow

### Workflow: Safe Large-Scale Refactor

**Scenario**: Refactor authentication system from sessions to JWT

**Steps**:

```bash
# 1. Plan refactor with staged approach
/refactor-followups
REFACTOR_TARGET: Authentication system
REFACTOR_TYPE: replace
RISK_LEVEL: high
PARALLEL_WORK: yes

# Output: 6-phase refactor plan
#   Phase 1: Add JWT generation alongside sessions (parallel systems)
#   Phase 2: Update clients to accept JWT (opt-in)
#   Phase 3: Roll out JWT to 10% of users (canary)
#   Phase 4: Roll out JWT to 100% of users
#   Phase 5: Deprecate session endpoints
#   Phase 6: Remove session code (after 3 months)

# 2. Review refactor for semantic safety
/review:refactor-safety
TARGET: src/auth/
DEPTH: paranoid
FOCUS: behavior-changes,edge-cases,error-handling
REFACTOR_TYPE: replace

# Output: 5 potential semantic drifts detected
#   - BLOCKER: JWT expiration logic differs from session timeout
#   - HIGH: Error response format changed (breaks mobile app)
#   - HIGH: Admin impersonation not implemented in JWT path
#   - MEDIUM: Rate limiting not applied to JWT endpoints
#   - LOW: Log format changed (affects parsing)

# 3. Create compatibility tests
/test-matrix
TARGET: Authentication refactor (sessions → JWT)
RISK_LEVEL: critical
COVERAGE_GOAL: 99
TEST_TYPES: unit,integration,e2e,chaos

# Output: Test matrix with 60 scenarios
#   - Parallel path tests (both sessions and JWT work)
#   - Migration tests (session → JWT conversion)
#   - Backwards compatibility tests (old clients still work)
#   - Edge case tests (expired tokens, revocation, refresh)
#   - Chaos tests (JWT service down, fall back to sessions)

# 4. Technical debt tracking
/debt-register
SCOPE: team
DEBT_SOURCES: code,architecture
PRIORITIZATION: balanced
TIME_HORIZON: quarter

# Output: Debt items to address during refactor
#   - P1: Remove 5 dead auth endpoints (effort: S, impact: MED)
#   - P1: Consolidate 3 user models into 1 (effort: M, impact: HIGH)
#   - P2: Migrate from bcrypt to argon2 (effort: M, impact: MED)
#   - P3: Add 2FA support (effort: L, impact: MED)
```

**Phase 1 Implementation** (Parallel Systems):

```typescript
// Before: Sessions only
app.post('/api/auth/login', async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);
  req.session.userId = user.id;  // Session-based
  res.json({ success: true });
});

// After: Sessions + JWT (parallel)
app.post('/api/auth/login', async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);

  // Session path (existing)
  req.session.userId = user.id;

  // JWT path (new, opt-in)
  const jwt = generateJWT(user);

  res.json({
    success: true,
    jwt: jwt,  // Clients can opt-in to JWT
    session: true  // Session still works
  });
});
```

**Validation**:

```bash
# After each phase, validate semantic equivalence
/review:refactor-safety
TARGET: src/auth/
DEPTH: paranoid
FOCUS: behavior-changes
REFACTOR_TYPE: replace

# Run compatibility tests
npm test -- auth.test.ts
# ✅ All 60 tests pass (both paths work)
```

---

## Session Management Workflow

### Workflow: Complete Work Session

**Scenario**: Work session for payment API v2 migration

**Session Start**:

```bash
# Create session directory
mkdir -p .claude/payment-api-v2

# Document goals in session README
cat > .claude/payment-api-v2/README.md << 'EOF'
# Session: Payment API v2 Migration

**Started**: 2025-01-15
**Status**: In Progress

## Goals

1. Migrate payment processing to Stripe v2 API
2. Add support for payment intents (SCA compliance)
3. Implement webhook handling for async events
4. Achieve 95% test coverage
5. Document PCI compliance changes

## Artifacts

- [ ] src/payment/stripe-v2.ts - Stripe v2 client
- [ ] src/payment/webhooks.ts - Webhook handlers
- [ ] tests/payment/ - Test suite
- [ ] docs/pci-compliance.md - PCI documentation
EOF
```

**During Session**:

```bash
# Track progress by updating README as you work
echo "## Progress" >> .claude/payment-api-v2/README.md
echo "" >> .claude/payment-api-v2/README.md
echo "### 2025-01-15" >> .claude/payment-api-v2/README.md
echo "- ✅ Created Stripe v2 client with payment intents" >> .claude/payment-api-v2/README.md
echo "- ✅ Implemented webhook handlers with idempotency" >> .claude/payment-api-v2/README.md
echo "- 🚧 Writing integration tests (45/60 complete)" >> .claude/payment-api-v2/README.md
echo "- ⏸️ PCI docs blocked on legal review" >> .claude/payment-api-v2/README.md
```

**Before PR**:

```bash
# Create handoff for reviewers
/handoff
AUDIENCE: reviewers
CHANGE: "Payment API v2 migration with Stripe payment intents"
CRITICAL_PATHS: checkout,subscriptions,refunds,webhooks
ROLLBACK_PLAN: feature-flag

# Output: Review handoff document
#   - Where to start: src/payment/stripe-v2.ts (core client)
#   - Highest risk: webhook idempotency logic
#   - Test commands: npm test -- payment
#   - Expected behavior: 3D Secure flow now required for EU cards
```

**After PR Merged**:

```bash
# Close session
/close-session
SESSION_SLUG: payment-api-v2
STATUS: Done
OUTCOME: "Completed payment API migration to Stripe v2 with payment intents. Achieved 96% test coverage. Ready for staging deployment."
PR_OR_COMMIT: https://github.com/myorg/myapp/pull/456
ROLL_OUT: phased
FOLLOW_UPS:
  - Load test with 10k req/s target (@platform team, ETA: 1 week)
  - Legal sign-off on PCI docs (@legal team, ETA: 2 weeks)
  - Security penetration test (@security team, ETA: 3 weeks)
ARTIFACTS_COMPLETED:
  - src/payment/stripe-v2.ts (620 lines) - Stripe v2 API client with payment intents
  - src/payment/webhooks.ts (340 lines) - Webhook handlers with idempotency
  - tests/payment/stripe-v2.test.ts (480 lines) - Integration tests (96% coverage)
  - docs/pci-compliance.md (85 pages) - PCI DSS compliance documentation

# Output:
#   - ✅ .claude/payment-api-v2/README.md updated with closure section
#   - ✅ .claude/README.md index updated with [DONE] tag
#   - Closure summary generated (5-10 bullets for team update)
```

**Closure Summary** (generated):

```markdown
## Session Closure: Payment API v2 Migration

**Status**: Done
**Date**: 2025-01-15

### Key Accomplishments

1. **Migrated payment processing to Stripe v2 API** with support for payment intents, saved cards, and 3D Secure authentication for EU compliance

2. **Achieved 96% test coverage** with 60 integration tests covering success paths, error handling, edge cases, and webhook idempotency

3. **Implemented webhook handlers** with idempotency keys to handle async payment events (payment.succeeded, payment.failed, subscription updates)

4. **Completed PCI DSS compliance documentation** (85 pages) covering data flow, encryption, access controls, and audit logging

5. **Ready for phased rollout** with feature flag strategy and comprehensive monitoring

### Deliverables

- `src/payment/stripe-v2.ts` (620 lines) - Stripe v2 API client with payment intents
- `src/payment/webhooks.ts` (340 lines) - Webhook handlers with idempotency
- `tests/payment/stripe-v2.test.ts` (480 lines) - Integration test suite (96% coverage)
- `docs/pci-compliance.md` (85 pages) - PCI DSS compliance documentation

### Follow-ups

- Load test with 10k req/s target (@platform team, ETA: 1 week)
- Legal sign-off on PCI docs (@legal team, ETA: 2 weeks)
- Security penetration test (@security team, ETA: 3 weeks)
```

---

## Workflow Best Practices

### 1. Always Start with Risk Assessment

Before any significant change:
1. Run `/risk-assess` to understand risks
2. Run `/compat-check` to identify breaking changes
3. Adjust rollout strategy based on risk level

### 2. Layer Reviews for Critical Changes

For production systems:
1. Security review (`/review:security`)
2. Performance review (`/review:frontend-performance` or `/review:backend-concurrency`)
3. Observability review (`/review:observability`)
4. Production readiness (`/prod-readiness`)

### 3. Document Everything with Handoffs

Before deployment:
1. Create oncall handoff (`/handoff AUDIENCE:oncall`)
2. Create reviewer handoff (`/handoff AUDIENCE:reviewers`)
3. Link handoffs in PR description

### 4. Close Sessions Properly

After completing work:
1. Update session README with progress
2. Create handoff docs for next owner
3. Close session with `/close-session`
4. Track follow-ups in JIRA/Linear

### 5. Use Incidents as Learning Opportunities

After incidents:
1. Create reproduction harness (`/repro-harness`)
2. Perform RCA (`/rca`)
3. Convert to actions (`/postmortem-actions`)
4. Track progress and measure MTTR improvement

---

**Next**: See [Skills Guide](skills.md) for wide-event observability documentation
