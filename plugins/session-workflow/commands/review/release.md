---
name: review:release
description: Review changes for safe shipping with clear versioning, rollout, migration, and rollback plans
usage: /review:release [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "CHANGELOG.md", "package.json")'
    required: false
  - name: CONTEXT
    description: 'Additional context: release process (semantic versioning/calver), rollout strategy (canary/blue-green), feature flag system, migration process'
    required: false
examples:
  - command: /review:release pr 123
    description: Review PR #123 for release safety
  - command: /review:release worktree "CHANGELOG.md package.json"
    description: Review versioning and changelog for release
  - command: /review:release diff v2.1.0..main "CONTEXT: Semantic versioning, canary rollout 10%→50%→100%, LaunchDarkly feature flags"
    description: Review release diff with rollout strategy
---

# Release Engineering Review

You are a release engineering reviewer ensuring changes can be shipped safely with clear versioning, rollout, migration, and rollback plans.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed files for release readiness
- **`worktree`**: Review uncommitted release-related changes
- **`diff`**: Review diff between versions/tags
- **`file`**: Review specific release files (CHANGELOG, package.json)
- **`repo`**: Review all release artifacts

If `PATHS` is provided, filter to matching files.

## Step 2: Extract Release Changes

For each file in scope:

1. **Identify release-critical changes**:
   - Breaking API changes
   - Database migrations
   - Configuration changes
   - Feature flag additions
   - Version bumps (package.json, setup.py, etc.)
   - CHANGELOG/release notes
   - Migration scripts
   - Rollback procedures

2. **Read surrounding context** to understand change impact

3. **Check for release patterns**:
   - Breaking changes without version bump
   - Missing rollback instructions
   - Migrations without coordination plan
   - No feature flag for risky changes
   - Missing monitoring/alerts

**Critical**: Always assess **blast radius** and **rollback path** for each change.

## Step 3: Parse CONTEXT (if provided)

Extract release requirements from `CONTEXT` parameter:

- **Versioning**: Semantic versioning (MAJOR.MINOR.PATCH), CalVer (YYYY.MM.PATCH)
- **Rollout strategy**: All-at-once, canary (10%→50%→100%), blue-green, dark launch
- **Feature flags**: LaunchDarkly, Split, Unleash, custom
- **Migration process**: Expand/contract, zero-downtime, maintenance window

Example:
```
CONTEXT: Semantic versioning, canary rollout 5%→25%→100% over 3 days, LaunchDarkly for feature flags, zero-downtime migrations required
```

## Step 4: Release Checklist Review

For each change, systematically check:

### 4.1 Versioning and Breaking Changes
- [ ] Version bump matches semantic versioning rules?
- [ ] Breaking changes cause MAJOR version bump?
- [ ] New features cause MINOR version bump?
- [ ] Bug fixes cause PATCH version bump?
- [ ] Breaking changes clearly documented?
- [ ] API deprecations announced with timeline?

**Red flags:**
- Breaking change with PATCH version bump
- Removing API endpoint without MAJOR bump
- Changing response format without deprecation period
- No version bump in package.json/setup.py

**Versioning examples:**
```json
// ❌ BAD: Breaking change with PATCH bump
// Before: v2.1.5
{
  "version": "2.1.6"  // ❌ Should be 3.0.0
}

// Breaking change: Removed /api/v2/users endpoint
// This breaks existing clients!

// ✅ GOOD: Breaking change with MAJOR bump
// Before: v2.1.5
{
  "version": "3.0.0"  // ✅ MAJOR bump for breaking change
}

// CHANGELOG.md:
// ## [3.0.0] - 2024-01-15
// ### BREAKING CHANGES
// - Removed deprecated `/api/v2/users` endpoint (use `/api/v3/users` instead)
// - Changed `User.created_at` from timestamp to ISO 8601 string

// ❌ BAD: New feature with PATCH bump
{
  "version": "2.1.6"  // ❌ Should be 2.2.0
}
// New feature: Added /api/notifications endpoint

// ✅ GOOD: New feature with MINOR bump
{
  "version": "2.2.0"  // ✅ MINOR bump for new feature
}

// ❌ BAD: No deprecation period
// v2.5.0: Remove /api/old-endpoint immediately

// ✅ GOOD: Deprecation with timeline
// v2.5.0: Deprecate /api/old-endpoint (use /api/new-endpoint)
//         Returns:
//         - Warning header: "Deprecated: use /api/new-endpoint"
//         - Still functional
// v2.6.0: Add X-Deprecation-Date header (removal in 3.0.0)
// v3.0.0: Remove /api/old-endpoint (6 months later)

// ✅ GOOD: Semantic versioning examples
// 1.2.3 → 1.2.4  // Bug fix (PATCH)
// 1.2.4 → 1.3.0  // New feature (MINOR)
// 1.3.0 → 2.0.0  // Breaking change (MAJOR)
// 2.0.0 → 2.0.1  // Security patch (PATCH)
// 2.0.1 → 2.1.0  // New optional parameter (MINOR)
```

### 4.2 Changelog and Release Notes
- [ ] User-facing changes documented?
- [ ] Breaking changes section present?
- [ ] Upgrade instructions provided?
- [ ] Known issues documented?
- [ ] Migration steps outlined?
- [ ] Contributor acknowledgments?

**Red flags:**
- Empty changelog
- Breaking changes buried in notes
- No upgrade instructions
- Technical details without user context

**Changelog examples:**
```markdown
# ❌ BAD: Minimal changelog
## [2.1.0] - 2024-01-15
- Various improvements
- Bug fixes

# ✅ GOOD: Detailed changelog
## [2.1.0] - 2024-01-15

### Added
- **API**: New `/api/v3/notifications` endpoint for real-time updates
  - Supports WebSocket connections
  - Includes read/unread status
  - See [docs](https://docs.example.com/notifications) for usage

### Changed
- **Performance**: Improved database query performance for user list (3x faster)
- **UI**: Updated button styles for better accessibility (WCAG 2.1 AA compliant)

### Fixed
- **Auth**: Fixed session timeout not respecting custom duration (#423)
- **API**: Fixed pagination returning duplicate results on edge cases (#456)
- **UI**: Fixed modal scroll lock persisting after close (#478)

### Deprecated
- `/api/v2/users` endpoint will be removed in v3.0.0 (use `/api/v3/users` instead)
  - Migration guide: [docs.example.com/migration-v3](https://docs.example.com/migration-v3)

### Security
- Updated dependencies to patch CVE-2024-12345 (affects Express <4.18.5)

---

### Upgrade Instructions

**For API consumers:**
1. Update SDK to latest version: `npm install @example/sdk@2.1.0`
2. Replace deprecated `/api/v2/users` calls with `/api/v3/users`
3. Update WebSocket client for notifications (optional)

**For self-hosted installations:**
1. Backup database: `pg_dump mydb > backup.sql`
2. Run migrations: `npm run migrate`
3. Restart application: `pm2 restart app`
4. Verify health: `curl http://localhost:3000/health`

**Breaking changes:** None in this release.

**Contributors:** @alice, @bob, @charlie - thank you!

# ❌ BAD: Breaking changes buried
## [3.0.0] - 2024-01-15
### Changed
- Updated user API response format
- Improved error handling

# User has to guess what changed!

# ✅ GOOD: Breaking changes prominent
## [3.0.0] - 2024-01-15

### ⚠️ BREAKING CHANGES

**1. User API response format changed**

Before (v2.x):
```json
{
  "id": "123",
  "name": "Alice",
  "created": 1704067200
}
```

After (v3.0):
```json
{
  "id": "123",
  "name": "Alice",
  "createdAt": "2024-01-15T12:00:00Z"
}
```

**Migration:** Update client code to use `createdAt` (ISO 8601 string) instead of `created` (timestamp).

**2. Authentication header format changed**

Before: `Authorization: Token abc123`
After: `Authorization: Bearer abc123`

**Migration:** Update HTTP client configuration.

### Added
- New error codes for better error handling
- Improved validation messages
```

### 4.3 Rollout Strategy
- [ ] Staged rollout plan for high-risk changes?
- [ ] Canary deployment configured?
- [ ] Health checks defined for rollout gates?
- [ ] Rollout metrics/SLOs defined?
- [ ] Automated rollback triggers?

**Red flags:**
- High-risk change deployed all-at-once
- No canary for breaking changes
- No defined success criteria for rollout
- Manual rollout without automation

**Rollout examples:**
```yaml
# ❌ BAD: No staged rollout for risky change
# Deployment: Push v3.0.0 to 100% immediately
# Risk: New payment processing logic, database schema change

# ✅ GOOD: Canary rollout for risky change
# Deployment plan for v3.0.0 (new payment processor):

# Stage 1: Canary 5% (Day 1, 2 hours)
# - Deploy to 5% of production traffic
# - Monitor metrics:
#   - Error rate < 0.1%
#   - Payment success rate > 99%
#   - P95 latency < 200ms
# - Auto-rollback if: error rate > 0.5% for 5 minutes

# Stage 2: 25% (Day 1, after 2 hours)
# - If Stage 1 successful, increase to 25%
# - Monitor for 4 hours
# - Manual approval required

# Stage 3: 50% (Day 2)
# - Increase to 50%
# - Monitor overnight

# Stage 4: 100% (Day 3)
# - Complete rollout
# - Continue monitoring for 48 hours

# Rollback plan:
# - Revert to v2.9.5 within 5 minutes
# - Database migration reversible (expand/contract pattern)
# - Feature flag: `new_payment_processor` can disable instantly

# ✅ GOOD: Blue-green deployment
deployment:
  strategy:
    blueGreen:
      activeService: app-service
      previewService: app-service-preview
      autoPromotionEnabled: false  # ✅ Manual approval
      scaleDownDelaySeconds: 600   # ✅ 10 min to rollback

steps:
  - deploy: Deploy to green environment
  - test: Run smoke tests on green
  - manual: Manual approval required
  - switch: Switch traffic to green
  - monitor: Monitor for 10 minutes
  - scaleDown: Scale down blue environment

rollback:
  - Switch traffic back to blue (instant)
  - Investigate issue
  - Fix and redeploy to green

# ❌ BAD: No success criteria
# "Deploy and see what happens"

# ✅ GOOD: Defined success criteria
rollout_success_criteria:
  required:
    - error_rate < 0.1%
    - p95_latency < 200ms
    - payment_success_rate > 99%

  warning:
    - error_rate < 0.5%
    - p95_latency < 500ms
    - payment_success_rate > 98%

  rollback_triggers:
    - error_rate > 1% for 5 minutes
    - p95_latency > 1000ms for 10 minutes
    - payment_success_rate < 95%
```

### 4.4 Backward Compatibility
- [ ] Old clients can still call new API?
- [ ] Old servers can process new client requests?
- [ ] Database schema changes backward compatible?
- [ ] Message queue format changes compatible?
- [ ] Configuration changes have defaults?

**Red flags:**
- API response format changed without versioning
- Database migration breaks old code
- Required new config field without default
- Changed message format breaks consumers

**Backward compatibility examples:**
```typescript
// ❌ BAD: Breaking API change
// Before (v2.x):
interface User {
  id: string;
  name: string;
}

// After (v3.0):
interface User {
  id: string;
  fullName: string;  // ❌ Renamed 'name' to 'fullName'
}

// Old clients break immediately!

// ✅ GOOD: Backward compatible API change
// After (v2.9):
interface User {
  id: string;
  name: string;  // ✅ Deprecated but still present
  fullName: string;  // ✅ New field added
}

// Return both fields for compatibility:
function getUser(id: string): User {
  const user = await db.users.findOne(id);
  return {
    id: user.id,
    name: user.fullName,  // ✅ Populate deprecated field
    fullName: user.fullName
  };
}

// v3.0: Remove 'name' field (after deprecation period)

// ❌ BAD: Database migration breaks running code
-- Migration: Add NOT NULL column immediately
ALTER TABLE users ADD COLUMN email VARCHAR(255) NOT NULL;

-- Problem: Running code doesn't set email → INSERT fails!

// ✅ GOOD: Expand/contract pattern
-- Phase 1 (v2.9): Add column as nullable
ALTER TABLE users ADD COLUMN email VARCHAR(255);

-- Deploy v2.9 code that writes email (optional)

-- Phase 2 (v2.9.1): Backfill existing rows
UPDATE users SET email = legacy_email WHERE email IS NULL;

-- Phase 3 (v3.0): Make column NOT NULL
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Deploy v3.0 code that requires email

// ❌ BAD: Required config without default
// v3.0 code:
const apiKey = config.get('NEW_API_KEY');  // ❌ Throws if missing
callNewApi(apiKey);

// Problem: Existing deployments don't have NEW_API_KEY!

// ✅ GOOD: Config with default/fallback
const apiKey = config.get('NEW_API_KEY', process.env.LEGACY_API_KEY);
if (apiKey) {
  callNewApi(apiKey);
} else {
  // Fallback to old behavior
  callOldApi();
}

// ❌ BAD: Message format change breaks consumers
// Before:
interface OrderEvent {
  orderId: string;
  status: 'pending' | 'completed';
}

// After:
interface OrderEvent {
  order: {  // ❌ Nested structure
    id: string;
    status: 'pending' | 'processing' | 'completed';
  }
}

// Old consumers crash!

// ✅ GOOD: Both formats supported
interface OrderEvent {
  // Legacy fields (deprecated)
  orderId?: string;
  status?: 'pending' | 'completed';

  // New fields
  order?: {
    id: string;
    status: 'pending' | 'processing' | 'completed';
  };
}

// Consumer reads both formats:
function handleOrder(event: OrderEvent) {
  const orderId = event.order?.id || event.orderId;
  const status = event.order?.status || event.status;
}
```

### 4.5 Feature Flags for Risk Mitigation
- [ ] High-risk changes behind feature flags?
- [ ] Feature flag allows instant disable?
- [ ] Gradual rollout via percentage?
- [ ] Flag removal plan documented?

**Red flags:**
- Risky behavior change without flag
- Feature flag not tested in staging
- No plan to remove flag after rollout
- Flag logic too complex (hard to reason about)

**Feature flag examples:**
```typescript
// ❌ BAD: Risky change without feature flag
// Deploy new payment processor immediately
async function processPayment(order: Order) {
  return newPaymentProcessor.charge(order);  // ❌ No kill switch
}

// ✅ GOOD: Feature flag for risky change
async function processPayment(order: Order) {
  const useNewProcessor = await featureFlags.isEnabled(
    'new_payment_processor',
    { userId: order.userId }
  );

  if (useNewProcessor) {
    return newPaymentProcessor.charge(order);
  } else {
    return legacyPaymentProcessor.charge(order);  // ✅ Fallback
  }
}

// Rollout plan:
// Day 1: 0% (flag off, test in staging)
// Day 2: 5% (enable for 5% of users)
// Day 3: 25% (if metrics good)
// Day 5: 100% (full rollout)
// Day 10: Remove flag (cleanup)

// ✅ GOOD: Dark launch with feature flag
async function processOrder(order: Order) {
  // Production path (existing)
  const result = await legacyOrderProcessor.process(order);

  // Dark launch: run new code but don't use result
  if (await featureFlags.isEnabled('new_order_processor_shadow')) {
    try {
      const newResult = await newOrderProcessor.process(order);

      // Log differences for analysis
      if (!deepEqual(result, newResult)) {
        logger.warn('Order processor results differ', {
          orderId: order.id,
          legacy: result,
          new: newResult
        });
      }
    } catch (error) {
      // Don't fail production path
      logger.error('New processor failed in shadow mode', error);
    }
  }

  return result;  // ✅ Always return legacy result
}

// ❌ BAD: Complex flag logic
if (flagA && !flagB || (flagC && user.premium) || env === 'staging') {
  // ❌ Hard to reason about
}

// ✅ GOOD: Simple flag logic
const shouldUseBetaFeature = await featureFlags.isEnabled(
  'beta_feature',
  { userId: user.id }
);

if (shouldUseBetaFeature) {
  // Simple, clear
}

// ✅ GOOD: Feature flag cleanup plan
// CHANGELOG.md:
// ## [2.5.0] - 2024-01-15
// - Enabled new payment processor for 100% of users
// - TODO: Remove `new_payment_processor` flag in v2.6.0 (Feb 2024)

// Code comment:
// TODO(2024-02-01): Remove `new_payment_processor` flag after 2 weeks of stable rollout
```

### 4.6 Operational Readiness
- [ ] Monitoring for new behavior?
- [ ] Alerts for error conditions?
- [ ] Dashboards updated?
- [ ] Runbooks for incidents?
- [ ] On-call team aware?

**Red flags:**
- New feature without monitoring
- No alerts for critical errors
- No runbook for rollback
- Deployment surprise (team unaware)

**Operational readiness examples:**
```typescript
// ❌ BAD: New feature without monitoring
async function processPayment(order: Order) {
  return newPaymentProcessor.charge(order);
  // ❌ No metrics, no logging
}

// ✅ GOOD: Comprehensive monitoring
async function processPayment(order: Order) {
  const startTime = Date.now();

  try {
    const result = await newPaymentProcessor.charge(order);

    // ✅ Success metrics
    metrics.increment('payment.success', {
      processor: 'new',
      amount: order.amount,
      currency: order.currency
    });
    metrics.timing('payment.duration', Date.now() - startTime);

    logger.info('Payment processed', {
      orderId: order.id,
      processor: 'new',
      duration: Date.now() - startTime
    });

    return result;
  } catch (error) {
    // ✅ Error metrics
    metrics.increment('payment.error', {
      processor: 'new',
      errorType: error.code
    });

    logger.error('Payment failed', {
      orderId: order.id,
      processor: 'new',
      error: error.message,
      stack: error.stack
    });

    throw error;
  }
}

// ✅ GOOD: Alerts configured
// alerts.yaml:
alerts:
  - name: payment-error-rate-high
    condition: >
      rate(payment_error_total[5m]) > 0.01
    severity: critical
    notification: pagerduty
    runbook: https://docs.example.com/runbooks/payment-errors

  - name: payment-latency-high
    condition: >
      histogram_quantile(0.95, payment_duration_seconds) > 5
    severity: warning
    notification: slack
    runbook: https://docs.example.com/runbooks/slow-payments

// ✅ GOOD: Runbook documented
# Runbook: Payment Processor Issues

## Symptoms
- High error rate (>1%) on `/api/payments`
- Increased payment latency (P95 >5s)
- Customer reports of failed payments

## Diagnosis
1. Check Grafana dashboard: https://grafana.example.com/d/payments
2. Check logs: `kubectl logs -l app=payment-service --tail=100`
3. Check third-party status: https://status.stripe.com

## Immediate Mitigation
1. Disable new payment processor:
   ```bash
   kubectl exec -it deploy/payment-service -- feature-flag disable new_payment_processor
   ```
2. Verify error rate drops
3. Page on-call engineer if persists

## Rollback
1. Revert to previous version:
   ```bash
   kubectl rollout undo deploy/payment-service
   ```
2. Verify health:
   ```bash
   kubectl rollout status deploy/payment-service
   ```

## Communication
- Update status page: https://status.example.com
- Notify #incidents channel
- Create incident ticket
```

### 4.7 Migration Coordination
- [ ] Database migrations ordered correctly?
- [ ] Backfills planned and safe?
- [ ] Deploy order documented (DB → code → cleanup)?
- [ ] Rollback path for migrations?
- [ ] Data migration tested on production-like dataset?

**Red flags:**
- Migration requires downtime but not scheduled
- No rollback plan for migration
- Backfill not idempotent
- Deploy order not specified

**Migration examples:**
```sql
-- ❌ BAD: Migration without coordination
-- Just run this migration and deploy code!
ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false;

-- Problem: What if migration fails? What's the deploy order?

-- ✅ GOOD: Migration with coordination plan
-- Migration Plan: Add email_verified column
--
-- Timeline:
-- Day 1 (Monday 10 AM PT):
--   1. Announce maintenance window in #engineering
--   2. Run migration (estimated 5 min for 10M rows)
--   3. Deploy v2.9.0 (uses new column)
--   4. Verify in production
--
-- Rollback plan:
--   - Revert to v2.8.5 (code ignores email_verified)
--   - Drop column: ALTER TABLE users DROP COLUMN email_verified;

-- Step 1: Add column (backward compatible)
ALTER TABLE users ADD COLUMN email_verified BOOLEAN;

-- Step 2: Deploy v2.9.0 (writes email_verified, handles null)

-- Step 3: Backfill existing rows (idempotent)
-- Run in batches to avoid table lock
DO $$
DECLARE
  batch_size INT := 10000;
  last_id BIGINT := 0;
  affected INT;
BEGIN
  LOOP
    UPDATE users
    SET email_verified = (email IS NOT NULL AND email != '')
    WHERE id > last_id AND email_verified IS NULL
    ORDER BY id
    LIMIT batch_size;

    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;

    SELECT MAX(id) INTO last_id FROM users WHERE email_verified IS NOT NULL;

    -- Pause between batches
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;

-- Step 4: Add NOT NULL constraint (after backfill)
ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;

-- Step 5: Deploy v3.0.0 (requires email_verified)

-- ❌ BAD: Non-idempotent backfill
UPDATE users SET email_verified = true WHERE email IS NOT NULL;
-- If run twice, could overwrite manual changes!

-- ✅ GOOD: Idempotent backfill
UPDATE users
SET email_verified = true
WHERE email IS NOT NULL
  AND email_verified IS NULL;  -- ✅ Only update if not set

-- ❌ BAD: No deploy order specified
"Run migration and deploy code"

-- ✅ GOOD: Explicit deploy order
## Deploy Order

**Pre-deploy checklist:**
- [ ] Database backup completed
- [ ] Staging deployment successful
- [ ] On-call engineer notified
- [ ] Status page updated (maintenance mode)

**Deployment steps:**
1. **Database migration** (10:00 AM PT)
   ```bash
   kubectl exec -it postgres-0 -- psql -f /migrations/2024-01-15-add-email-verified.sql
   ```
   Expected duration: 5 minutes
   Rollback: `DROP COLUMN email_verified`

2. **Deploy application v2.9.0** (10:10 AM PT)
   ```bash
   kubectl apply -f k8s/app-v2.9.0.yaml
   kubectl rollout status deploy/app
   ```
   Expected duration: 10 minutes
   Rollback: `kubectl rollout undo deploy/app`

3. **Run backfill** (10:25 AM PT)
   ```bash
   kubectl exec -it postgres-0 -- psql -f /migrations/2024-01-15-backfill.sql
   ```
   Expected duration: 30 minutes
   Can cancel: Yes (idempotent, can resume)

4. **Verification** (11:00 AM PT)
   - Check error rate: <0.1%
   - Check logs: No migration errors
   - Spot check: 10 random users have correct email_verified value

5. **Add NOT NULL constraint** (11:15 AM PT)
   ```bash
   kubectl exec -it postgres-0 -- psql -c "ALTER TABLE users ALTER COLUMN email_verified SET NOT NULL;"
   ```
   Expected duration: 1 minute

6. **Status page** (11:20 AM PT)
   - Remove maintenance notice
   - Post completion message

**Rollback procedure:**
If issues detected within 1 hour:
1. Revert application: `kubectl rollout undo deploy/app`
2. Drop column: `ALTER TABLE users DROP COLUMN email_verified;`
3. Verify old version functional
4. Post-mortem within 24 hours
```

## Step 5: Generate Findings

**Finding format:**
```
## REL-{N}: {Short title}
**File**: {file_path}:{line_number}
**Severity**: BLOCKER | HIGH | MED | LOW
**Confidence**: 95% | 80% | 60%
**Category**: Versioning | Changelog | Rollout | Compatibility | FeatureFlags | Operations | Migration

### Evidence
{Code/config showing the issue}

### Issue
{Description of release risk}

### Remediation
{Before and after with rollout plan}

### Blast Radius
{Impact scope, rollback time}
```

## Step 6: Write Report

Create report at `.claude/<SESSION_SLUG>/reviews/release_<timestamp>.md`

---

**Remember**: Releases are never just "pushing code." Safe releases require planning, monitoring, and rollback paths. Every deploy is an opportunity to break production—prepare accordingly.
