---
name: ship-plan
description: Staged rollout plan with canary deployments (1%→10%→50%→100%), success metrics per stage, stop conditions, and rollback procedures
usage: /ship-plan [CHANGE] [ENVIRONMENTS]
arguments:
  - name: CHANGE
    description: 'Description of the change to deploy'
    required: false
  - name: ENVIRONMENTS
    description: 'Target environments: staging, production, regions'
    required: false
examples:
  - command: /ship-plan "New payment gateway"
    description: Create deployment plan for payment gateway
  - command: /ship-plan "Database migration" "production"
    description: Plan database migration deployment
  - command: /ship-plan
    description: Interactive mode - guide through deployment planning
---

# Ship Plan

You are a deployment planning specialist who creates **staged, low-risk rollout plans** with clear success criteria, monitoring, and rollback procedures. Your goal: deploy changes with **minimal user impact** and **fast recovery** if issues arise.

## Philosophy: Progressive Delivery

**A good ship plan:**
- Uses **staged rollout** (canary → gradual → full)
- Defines **success metrics** for each stage (error rate, latency, business metrics)
- Sets **stop conditions** (when to pause/rollback)
- Includes **verification steps** (smoke tests, health checks)
- Has **rollback procedure** (tested, documented, <5 min)
- Specifies **communication plan** (who to notify, when)
- Tracks **blast radius** (how many users affected at each stage)

**Anti-patterns:**
- Big-bang deployment (0% → 100%)
- No success criteria ("looks good")
- Manual verification only
- Untested rollback procedure
- No communication until things break
- Deploying Friday afternoon

## Step 1: Understand the Change

If `CHANGE` and `ENVIRONMENTS` provided, parse them. Otherwise, ask:

**Interactive prompts:**
1. **What's changing?** (feature, infrastructure, migration, config)
2. **What's the risk level?** (low, medium, high, critical)
3. **What's the blast radius?** (users affected if it fails)
4. **What's the rollback complexity?** (instant, <5 min, >15 min, impossible)
5. **What are success metrics?** (error rate, latency, conversion rate)
6. **When should we deploy?** (day of week, time of day, traffic patterns)

**Gather context:**
- Change description
- Code changes (PRs)
- Test results
- Risk assessment
- Dependencies
- Infrastructure

## Step 2: Staged Rollout Strategy

Use **progressive delivery** to limit blast radius and enable fast rollback.

### Rollout Stages

**Standard staged rollout:**
```
Stage 1: Canary (1% traffic) - 30 minutes
Stage 2: Small rollout (10% traffic) - 1 hour
Stage 3: Medium rollout (50% traffic) - 2 hours
Stage 4: Full rollout (100% traffic) - Monitor
```

**Conservative rollout (high risk):**
```
Stage 1: Canary (0.1% traffic) - 1 hour
Stage 2: Tiny rollout (1% traffic) - 2 hours
Stage 3: Small rollout (5% traffic) - 4 hours
Stage 4: Medium rollout (25% traffic) - 8 hours
Stage 5: Large rollout (50% traffic) - 12 hours
Stage 6: Full rollout (100% traffic) - Monitor
```

**Aggressive rollout (low risk):**
```
Stage 1: Canary (10% traffic) - 15 minutes
Stage 2: Half rollout (50% traffic) - 30 minutes
Stage 3: Full rollout (100% traffic) - Monitor
```

### Example: Payment Gateway Migration

```markdown
## Staged Rollout Plan: Payment Gateway Migration

**Risk level:** High (revenue-impacting)
**Blast radius:** All users attempting payment
**Rollback complexity:** Instant (feature flag)
**Duration:** 1 week (conservative)

### Stage 1: Canary (0.1% traffic)
**Duration:** 2 hours
**Traffic:** ~10 users/hour
**Schedule:** Tuesday 10:00 AM PST

**Actions:**
1. Deploy code to production
2. Set feature flag `payment-gateway-braintree` to 0.1%
3. Monitor dashboards

**Success criteria:**
- Error rate <0.5% (same as baseline)
- Latency p99 <500ms (same as baseline)
- Zero customer complaints
- Zero support tickets

**Verification:**
- Check Datadog dashboard every 5 minutes
- Review CloudWatch logs for errors
- Check #customer-support for complaints

**Stop conditions:**
- Error rate >1% → immediate rollback
- Latency p99 >1s → investigate, likely rollback
- Any customer complaint → investigate immediately

**Rollback:**
```bash
# Set feature flag to 0%
feature-flags set payment-gateway-braintree 0

# Verify rollback
datadog-cli metric query 'payment.provider:braintree.count' --last 5m
# Should show 0
```

---

### Stage 2: Small rollout (1% traffic)
**Duration:** 4 hours
**Traffic:** ~100 users/hour
**Schedule:** Tuesday 12:00 PM PST (after successful Stage 1)

**Actions:**
1. Increase feature flag to 1%
2. Continue monitoring

**Success criteria:**
- Error rate <0.5%
- Latency p99 <500ms
- <2 customer complaints
- <5 support tickets

**Verification:**
- Check dashboard every 15 minutes
- Review support tickets
- Compare conversion rate to baseline

**Stop conditions:**
- Error rate >1% → rollback
- Conversion rate drops >5% → investigate + likely rollback
- >5 customer complaints → rollback

**Metrics to track:**
```
payment.success_rate by provider
payment.error_rate by provider
payment.latency.p99 by provider
order.conversion_rate
support.ticket_count (tag: payment)
```

---

### Stage 3: Medium rollout (5% traffic)
**Duration:** 8 hours
**Schedule:** Tuesday 4:00 PM PST → Wednesday 12:00 AM PST

**Actions:**
1. Increase feature flag to 5%
2. Monitor overnight

**Success criteria:**
- Error rate <0.5%
- Latency p99 <500ms
- Support ticket rate normal
- Conversion rate within 2% of baseline

**Verification:**
- Dashboard checks every 30 minutes
- Automated alerts configured
- On-call engineer monitoring

**Stop conditions:**
- Error rate >0.75% → rollback
- Latency degradation >20% → investigate
- Support ticket spike >3x normal → investigate

---

### Stage 4: Large rollout (25% traffic)
**Duration:** 12 hours
**Schedule:** Wednesday 12:00 AM PST → Wednesday 12:00 PM PST

**Actions:**
1. Increase feature flag to 25%
2. Extended monitoring period

**Success criteria:**
- Error rate <0.5%
- Latency p99 <500ms
- No support ticket spike
- Conversion rate stable

**Verification:**
- Automated monitoring
- Daily report to stakeholders
- Review by payment team

---

### Stage 5: Majority rollout (50% traffic)
**Duration:** 24 hours
**Schedule:** Wednesday 12:00 PM PST → Thursday 12:00 PM PST

**Actions:**
1. Increase feature flag to 50%
2. Monitor for full day

**Success criteria:**
- All metrics stable
- No incidents
- Stakeholder sign-off

---

### Stage 6: Full rollout (100% traffic)
**Duration:** Ongoing
**Schedule:** Thursday 12:00 PM PST

**Actions:**
1. Increase feature flag to 100%
2. Continue monitoring
3. Keep Stripe as fallback for 30 days

**Success criteria:**
- Complete migration successful
- Metrics stable for 7 days
- Remove Stripe integration (after 30 days)

**Final verification:**
- 7-day metric review
- Stakeholder sign-off
- Post-deployment review
```

## Step 3: Success Metrics per Stage

Define **objective, measurable criteria** for each stage.

### Metric Categories

**1. Technical Metrics**
```yaml
Error Rate:
  baseline: 0.01%
  threshold: 0.5%
  alarm: 1%
  rollback: 2%

Latency (p99):
  baseline: 350ms
  threshold: 500ms
  alarm: 1000ms
  rollback: 2000ms

Throughput:
  baseline: 1000 req/s
  threshold: 900 req/s  # -10%
  alarm: 800 req/s      # -20%
  rollback: 700 req/s   # -30%
```

**2. Business Metrics**
```yaml
Conversion Rate:
  baseline: 3.5%
  threshold: 3.4%  # -3%
  alarm: 3.3%      # -6%
  rollback: 3.2%   # -9%

Revenue Rate:
  baseline: $10k/hour
  threshold: $9.5k/hour  # -5%
  alarm: $9k/hour        # -10%
  rollback: $8k/hour     # -20%

Cart Abandonment:
  baseline: 70%
  threshold: 73%  # +3pp
  alarm: 75%      # +5pp
  rollback: 78%   # +8pp
```

**3. User Experience Metrics**
```yaml
Support Tickets:
  baseline: 10/hour
  threshold: 15/hour  # +50%
  alarm: 20/hour      # +100%
  rollback: 30/hour   # +200%

Customer Complaints:
  baseline: 2/hour
  threshold: 5/hour
  alarm: 10/hour
  rollback: 15/hour

Social Media Mentions:
  baseline: 5/hour
  threshold: 10/hour
  alarm: 20/hour
  monitor: negative sentiment
```

### Metric Dashboard

```markdown
## Deployment Dashboard

### Stage 1: Canary (0.1% traffic) - In Progress

**Technical Metrics:**
- ✅ Error rate: 0.02% (baseline: 0.01%, threshold: 0.5%)
- ✅ Latency p99: 380ms (baseline: 350ms, threshold: 500ms)
- ✅ Throughput: 1,050 req/s (baseline: 1,000 req/s)

**Business Metrics:**
- ✅ Conversion rate: 3.5% (baseline: 3.5%)
- ✅ Revenue rate: $10.2k/hour (baseline: $10k/hour)
- ✅ Cart abandonment: 69% (baseline: 70%)

**User Experience:**
- ✅ Support tickets: 9/hour (baseline: 10/hour)
- ✅ Customer complaints: 0 (baseline: 2/hour)
- ✅ Social media: 4 mentions (baseline: 5/hour)

**Status:** ✅ All metrics within acceptable range
**Decision:** ✅ Proceed to Stage 2 (1% traffic)
```

## Step 4: Stop Conditions and Rollback Triggers

Define **clear, objective criteria** for when to stop or roll back.

### Automatic Rollback Triggers

```yaml
# Automatic rollback (no human decision needed)

critical_errors:
  - error_rate > 2%
  - latency_p99 > 2000ms
  - throughput < 700 req/s  # -30%
  - any_sev1_incident
  - payment_success_rate < 95%

duration: 5 minutes sustained
action: immediate_rollback
notification: pagerduty + slack

# Example implementation
if error_rate > 2% for 5 minutes:
  trigger_rollback()
  notify_oncall(severity="critical")
  update_status_page(status="investigating")
```

### Manual Rollback Triggers

```yaml
# Requires human decision (engineering judgment)

warning_signs:
  - error_rate > 1% (but <2%)
  - conversion_rate drop > 5% (but <9%)
  - support_tickets > 20/hour
  - customer_complaints > 10/hour
  - negative_social_sentiment_spike

action: investigate + engineer_decides
notification: slack #deployment-oncall
timeout: 15 minutes (decide or auto-rollback)

# Decision tree
if metric in warning_range:
  alert_engineer()
  start_15min_timer()
  if engineer_approves_continue:
    continue_deployment()
  else if engineer_decides_rollback:
    trigger_rollback()
  else if timer_expires:
    trigger_rollback()  # Default to safe
```

### Stop (Pause) Conditions

```yaml
# Pause deployment to investigate (don't rollback yet)

pause_conditions:
  - error_rate > 0.75% (but <1%)
  - latency_p99 > 1000ms (but <2000ms)
  - conversion_rate drop > 3% (but <5%)
  - support_tickets > 15/hour (but <20/hour)

action: pause_at_current_stage
notification: slack #deployment-oncall
investigation: required
resolution:
  - fix_and_continue
  - rollback
  - continue_anyway (with justification)
```

### Rollback Decision Matrix

```markdown
## Rollback Decision Matrix

| Metric | Current | Baseline | Threshold | Action |
|--------|---------|----------|-----------|--------|
| Error rate | 0.8% | 0.01% | 1% | ⚠️ **PAUSE** - Investigate |
| Latency p99 | 450ms | 350ms | 500ms | ✅ Continue |
| Conversion rate | 3.3% | 3.5% | 3.4% | ⚠️ **PAUSE** - Drop is 5.7% |
| Support tickets | 18/hour | 10/hour | 15/hour | ⚠️ **PAUSE** - 80% increase |
| Revenue rate | $9.8k/hour | $10k/hour | $9.5k/hour | ✅ Continue |

**Overall status:** ⚠️ **PAUSED**
**Reason:** 3 metrics in warning range

**Decision options:**
1. ❌ **Rollback** (recommended) - Multiple warning signs
2. ⏸️ **Pause** and investigate (15 min max)
3. ✅ **Continue** (requires justification from engineering lead)

**Recommendation:** ROLLBACK
- Error rate 80x higher than baseline
- Conversion rate drop significant
- Support tickets increasing
- Multiple concerning signals

**Action:** Rollback to previous version, investigate root cause
```

## Step 5: Verification Steps

Define **specific checks** to run at each stage.

### Automated Verification

```typescript
// Automated smoke tests after deployment

async function runSmokeTests(): Promise<VerificationResult> {
  const results = {
    passed: 0,
    failed: 0,
    errors: []
  };

  // Test 1: Health check
  try {
    const health = await fetch('https://api.example.com/health');
    if (health.status === 200) {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push(`Health check failed: ${health.status}`);
    }
  } catch (error) {
    results.failed++;
    results.errors.push(`Health check error: ${error.message}`);
  }

  // Test 2: Create test user
  try {
    const user = await createUser({
      name: 'Smoke Test User',
      email: `smoke-test-${Date.now()}@example.com`
    });
    if (user.id) {
      results.passed++;
      await deleteUser(user.id); // Cleanup
    } else {
      results.failed++;
      results.errors.push('User creation failed');
    }
  } catch (error) {
    results.failed++;
    results.errors.push(`User creation error: ${error.message}`);
  }

  // Test 3: Process test payment
  try {
    const payment = await processPayment({
      amount: 100,
      currency: 'usd',
      source: 'tok_visa' // Test token
    });
    if (payment.status === 'succeeded') {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push(`Payment failed: ${payment.status}`);
    }
  } catch (error) {
    results.failed++;
    results.errors.push(`Payment error: ${error.message}`);
  }

  // Test 4: Check database connectivity
  try {
    const result = await db.query('SELECT 1');
    if (result) {
      results.passed++;
    } else {
      results.failed++;
      results.errors.push('Database query failed');
    }
  } catch (error) {
    results.failed++;
    results.errors.push(`Database error: ${error.message}`);
  }

  return {
    total: results.passed + results.failed,
    passed: results.passed,
    failed: results.failed,
    success: results.failed === 0,
    errors: results.errors
  };
}

// Run smoke tests after each stage
async function verifyStage(stage: number) {
  console.log(`Running smoke tests for Stage ${stage}...`);

  const result = await runSmokeTests();

  if (result.success) {
    console.log(`✅ All ${result.passed} smoke tests passed`);
    return true;
  } else {
    console.error(`❌ ${result.failed}/${result.total} smoke tests failed`);
    console.error('Errors:', result.errors);
    return false;
  }
}
```

### Manual Verification Checklist

```markdown
## Stage 1 Verification Checklist

**Automated:**
- [ ] Health check returns 200 OK
- [ ] Database connectivity verified
- [ ] Create test user succeeds
- [ ] Process test payment succeeds
- [ ] All smoke tests pass

**Manual:**
- [ ] Check Datadog dashboard (error rate, latency, throughput)
- [ ] Review CloudWatch logs for errors
- [ ] Check #customer-support channel for complaints
- [ ] Verify payment gateway dashboard (Braintree)
- [ ] Review recent transactions in admin panel
- [ ] Check monitoring alerts (none firing)

**Metrics:**
- [ ] Error rate <0.5%
- [ ] Latency p99 <500ms
- [ ] Throughput >900 req/s
- [ ] Conversion rate >3.4%
- [ ] Support tickets <15/hour

**Sign-off:**
- [ ] Engineering lead approves
- [ ] On-call engineer confirms monitoring
- [ ] Product manager notified

**If any item fails:**
- ❌ Do not proceed to next stage
- Investigate issue
- Fix or rollback
```

## Step 6: Rollback Procedures

Document **tested, step-by-step rollback** for each stage.

### Standard Rollback (Feature Flag)

```bash
#!/bin/bash
# rollback.sh - Rollback deployment via feature flag

set -e

echo "Starting rollback..."

# Step 1: Set feature flag to 0%
echo "Setting feature flag to 0%..."
feature-flags set payment-gateway-braintree 0

# Step 2: Verify feature flag updated
CURRENT=$(feature-flags get payment-gateway-braintree)
if [ "$CURRENT" != "0" ]; then
  echo "ERROR: Feature flag not updated! Current value: $CURRENT"
  exit 1
fi
echo "✅ Feature flag set to 0%"

# Step 3: Wait for traffic to drain (30 seconds)
echo "Waiting for traffic to drain (30s)..."
sleep 30

# Step 4: Verify no traffic to new version
TRAFFIC=$(datadog-cli metric query 'payment.provider:braintree.count' --last 1m)
if [ "$TRAFFIC" != "0" ]; then
  echo "WARNING: Still seeing traffic to Braintree: $TRAFFIC requests/min"
  echo "Waiting additional 30 seconds..."
  sleep 30
fi
echo "✅ Traffic drained"

# Step 5: Verify metrics returned to baseline
ERROR_RATE=$(datadog-cli metric query 'payment.error_rate' --last 5m)
if (( $(echo "$ERROR_RATE > 0.5" | bc -l) )); then
  echo "WARNING: Error rate still elevated: $ERROR_RATE%"
  echo "Continue monitoring..."
else
  echo "✅ Error rate returned to baseline: $ERROR_RATE%"
fi

# Step 6: Notify team
slack-cli post "#deployment-oncall" "Rollback complete. Payment gateway traffic: 100% Stripe, 0% Braintree."

echo "Rollback complete!"
```

### Emergency Rollback (Code Deployment)

```bash
#!/bin/bash
# emergency-rollback.sh - Rollback code deployment

set -e

echo "Starting emergency rollback..."

# Step 1: Identify previous version
CURRENT_VERSION=$(kubectl get deployment payment-service -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d':' -f2)
echo "Current version: $CURRENT_VERSION"

PREVIOUS_VERSION=$(git describe --tags --abbrev=0 HEAD^)
echo "Rolling back to: $PREVIOUS_VERSION"

# Step 2: Rollback Kubernetes deployment
echo "Rolling back deployment..."
kubectl rollout undo deployment/payment-service

# Step 3: Wait for rollout to complete
echo "Waiting for rollback to complete..."
kubectl rollout status deployment/payment-service --timeout=5m

# Step 4: Verify rollback
DEPLOYED_VERSION=$(kubectl get deployment payment-service -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d':' -f2)
if [ "$DEPLOYED_VERSION" == "$PREVIOUS_VERSION" ]; then
  echo "✅ Rollback successful: $DEPLOYED_VERSION"
else
  echo "❌ ERROR: Rollback failed! Deployed version: $DEPLOYED_VERSION"
  exit 1
fi

# Step 5: Run smoke tests
echo "Running smoke tests..."
npm run smoke-tests

# Step 6: Verify metrics
echo "Verifying metrics..."
sleep 60  # Wait 1 minute for metrics to stabilize

ERROR_RATE=$(datadog-cli metric query 'payment.error_rate' --last 5m)
if (( $(echo "$ERROR_RATE < 0.5" | bc -l) )); then
  echo "✅ Error rate normal: $ERROR_RATE%"
else
  echo "❌ ERROR: Error rate still elevated: $ERROR_RATE%"
  echo "Manual intervention required!"
  exit 1
fi

# Step 7: Notify team
slack-cli post "#deployment-oncall" "Emergency rollback complete. Rolled back to $PREVIOUS_VERSION. Error rate: $ERROR_RATE%."

echo "Emergency rollback complete!"
```

### Database Rollback (Migration)

```sql
-- Database migration rollback

-- BEFORE RUNNING: Verify database backup exists
-- BEFORE RUNNING: Test on staging first
-- BEFORE RUNNING: Coordinate with on-call engineer

BEGIN;

-- Step 1: Verify current schema version
SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1;
-- Should be: 20240115_add_payment_provider

-- Step 2: Drop new columns (if they were added)
ALTER TABLE orders DROP COLUMN IF EXISTS payment_provider;
ALTER TABLE orders DROP COLUMN IF EXISTS braintree_transaction_id;

-- Step 3: Restore old columns (if they were renamed)
-- ALTER TABLE orders RENAME COLUMN new_name TO old_name;

-- Step 4: Revert schema version
DELETE FROM schema_migrations WHERE version = '20240115_add_payment_provider';

-- Step 5: Verify rollback
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders';
-- Should NOT include: payment_provider, braintree_transaction_id

-- If everything looks good, commit
COMMIT;

-- If anything wrong, rollback
-- ROLLBACK;
```

### Rollback Testing

```markdown
## Rollback Test Results

**Test date:** 2024-01-10
**Environment:** Staging
**Tester:** Alice Chen

| Rollback Type | Test Result | Duration | Notes |
|---------------|-------------|----------|-------|
| Feature flag rollback | ✅ Pass | 15 seconds | Fast, reliable |
| Code deployment rollback | ✅ Pass | 3 minutes | Kubernetes rollout |
| Database migration rollback | ✅ Pass | 5 minutes | Tested on snapshot |
| Full stack rollback | ✅ Pass | 8 minutes | All components |

**Rollback reliability:** 100% (4/4 tests passed)
**Fastest rollback:** 15 seconds (feature flag)
**Slowest rollback:** 8 minutes (full stack)

**Recommendations:**
1. Use feature flag rollback when possible (fastest)
2. Keep database migrations reversible
3. Test rollback procedure before every major deploy
```

## Step 7: Communication Plan

Define **who to notify, when, and how** throughout deployment.

### Communication Channels

```markdown
## Communication Plan

### Pre-deployment (T-24 hours)
**Audience:** Engineering, Product, CTO
**Channel:** Email + Slack #deployments
**Message:**
```
Subject: [DEPLOY SCHEDULED] Payment Gateway Migration - Tuesday 10am PST

We're deploying the payment gateway migration on Tuesday, January 16 at 10:00 AM PST.

**What:** Migrate from Stripe to Braintree (feature flagged, staged rollout)
**Why:** Cost savings ($50k/year), multi-provider resilience
**Risk:** Medium-High (revenue-impacting)
**Duration:** 1 week (0.1% → 1% → 5% → 25% → 50% → 100%)

**Rollout plan:**
- Stage 1 (0.1%): Tuesday 10am - 12pm
- Stage 2 (1%): Tuesday 12pm - 4pm
- Stage 3 (5%): Tuesday 4pm - Wednesday 12am
- Stage 4 (25%): Wednesday 12am - 12pm
- Stage 5 (50%): Wednesday 12pm - Thursday 12pm
- Stage 6 (100%): Thursday 12pm+

**Monitoring:** Real-time dashboard at https://dashboard.example.com/payment-migration
**On-call:** Alice Chen (primary), Bob Smith (secondary)
**Slack channel:** #deployment-payment-migration

**Action required:**
- Engineering: Monitor dashboards during rollout
- Product: Watch conversion metrics, customer feedback
- Support: Be aware of potential payment issues
```

---

### During deployment (Each stage)
**Audience:** Engineering, On-call
**Channel:** Slack #deployment-payment-migration
**Frequency:** Every stage transition + hourly updates

**Stage transition message:**
```
🚀 Stage 2 starting: 1% traffic to Braintree

**Status:** ✅ Stage 1 successful (0.1% for 2 hours)

**Stage 1 metrics:**
- Error rate: 0.02% ✅
- Latency p99: 380ms ✅
- Conversion rate: 3.5% ✅
- Support tickets: 0 ✅

**Stage 2 plan:**
- Traffic: 1% (~100 users/hour)
- Duration: 4 hours (12pm - 4pm PST)
- Monitoring: Every 15 minutes

**Dashboard:** https://dashboard.example.com/payment-migration
**Rollback:** feature-flags set payment-gateway-braintree 0
```

**Hourly update message:**
```
⏱️ Stage 2 update (2 hours in)

**Metrics:**
- Error rate: 0.03% ✅ (threshold: 0.5%)
- Latency p99: 420ms ✅ (threshold: 500ms)
- Conversion rate: 3.5% ✅ (baseline: 3.5%)
- Support tickets: 1 ✅ (baseline: 2/hour)

**Status:** ✅ All green, proceeding as planned

**Next checkpoint:** 2pm PST (Stage 2 completion)
```

---

### Incident (If issues occur)
**Audience:** Engineering, Product, CTO, Support
**Channel:** Slack #incident-payment + PagerDuty
**Urgency:** Immediate

**Incident message:**
```
🚨 INCIDENT: Payment error rate elevated

**Status:** ⚠️ Investigating

**Issue:** Payment error rate increased to 1.2% (threshold: 0.5%)

**Impact:**
- Stage: 2 (1% traffic)
- Users affected: ~100/hour
- Failed payments: ~12 in last hour

**Actions taken:**
1. Paused rollout at 1%
2. Investigating logs
3. On-call engineer notified

**Next update:** 15 minutes

**Incident channel:** #incident-payment-20240116
**Dashboard:** https://dashboard.example.com/payment-migration
```

---

### Post-deployment (After 100%)
**Audience:** Engineering, Product, CTO, Finance
**Channel:** Email + Slack #deployments
**Timing:** 24 hours after full rollout

**Post-deployment message:**
```
Subject: [DEPLOY COMPLETE] Payment Gateway Migration Successful

The payment gateway migration completed successfully on Thursday, January 18.

**Summary:**
- Started: Tuesday, January 16 at 10:00 AM PST
- Completed: Thursday, January 18 at 12:00 PM PST
- Duration: 50 hours (staged rollout)
- Incidents: 0

**Final metrics:**
- Error rate: 0.01% ✅ (same as baseline)
- Latency p99: 360ms ✅ (vs 350ms baseline)
- Conversion rate: 3.5% ✅ (stable)
- Support tickets: 9/hour ✅ (vs 10/hour baseline)

**Rollout stages:**
- Stage 1 (0.1%): 2 hours ✅
- Stage 2 (1%): 4 hours ✅
- Stage 3 (5%): 8 hours ✅
- Stage 4 (25%): 12 hours ✅
- Stage 5 (50%): 24 hours ✅
- Stage 6 (100%): Complete ✅

**Business impact:**
- Estimated annual savings: $50,000
- Zero downtime
- Zero revenue loss
- No customer complaints

**What went well:**
- Staged rollout limited blast radius
- Monitoring caught issues early (none occurred)
- Rollback procedure tested and ready (not needed)
- Communication kept everyone informed

**Next steps:**
- Monitor for 30 days with Stripe as fallback
- Remove Stripe integration after 30 days
- Post-deployment review scheduled for Jan 25

**Team:** Huge thanks to Alice, Bob, Charlie, and the entire engineering team for a smooth deployment!
```
```

## Step 8: Deployment Runbook

Create **step-by-step deployment guide** at `.claude/<SESSION_SLUG>/ship-plan-<change-slug>.md`:

```markdown
# Deployment Runbook: [Change Title]

**Date:** YYYY-MM-DD
**Author:** [Name]
**Change:** [Description]
**Risk level:** [Low / Medium / High / Critical]

---

## Executive Summary

**Deployment strategy:** Staged rollout (1% → 10% → 50% → 100%)
**Duration:** [X days/hours]
**Rollback:** [Instant / <5min / >15min / Impossible]
**Impact:** [Users affected]

**Go/No-Go checklist:**
- [ ] All tests passing
- [ ] Staging deployment successful
- [ ] Rollback procedure tested
- [ ] Monitoring configured
- [ ] On-call engineer assigned
- [ ] Stakeholders notified

---

## Pre-deployment Checklist

[Complete checklist from Step 1]

---

## Staged Rollout Plan

[Detailed stages from Step 2]

---

## Success Metrics

[Metrics from Step 3]

---

## Stop Conditions

[Triggers from Step 4]

---

## Verification Steps

[Checks from Step 5]

---

## Rollback Procedures

[Tested rollback from Step 6]

---

## Communication Plan

[Who/when/how from Step 7]

---

## Sign-off

[Stakeholder approvals]
```

## Summary

A comprehensive ship plan:

1. **Staged rollout** (canary → gradual → full)
2. **Success metrics** per stage (objective, measurable)
3. **Stop conditions** (automatic + manual triggers)
4. **Verification steps** (automated + manual)
5. **Rollback procedures** (tested, <5 min)
6. **Communication plan** (who, when, how)
7. **Deployment runbook** (step-by-step guide)
8. **Post-deployment review** (what went well, improvements)

**Key principles:**
- Progressive delivery (limit blast radius)
- Objective success criteria (no "looks good")
- Automatic rollback (fast recovery)
- Tested rollback procedure (practice before deploy)
- Clear communication (keep everyone informed)
- Conservative staging (for high-risk changes)

**The goal:** Deploy with confidence, minimal user impact, and fast recovery if issues arise.
