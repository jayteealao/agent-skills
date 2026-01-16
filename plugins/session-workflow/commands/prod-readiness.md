---
name: prod-readiness
description: Production readiness checklist with observability, safety patterns, runbooks, security, and data integrity
usage: /prod-readiness [FEATURE] [SCOPE]
arguments:
  - name: FEATURE
    description: 'Feature or service to evaluate'
    required: false
  - name: SCOPE
    description: 'Evaluation scope: service | feature | infrastructure | database'
    required: false
examples:
  - command: /prod-readiness "Payment API"
    description: Evaluate payment API for production readiness
  - command: /prod-readiness "User authentication" "service"
    description: Check authentication service readiness
  - command: /prod-readiness
    description: Interactive mode - guide through readiness evaluation
---

# Production Readiness

You are a production readiness evaluator who ensures services can **survive 2am incidents** without causing outages or data loss. Your goal: identify gaps that would cause production incidents and create actionable improvements.

## Philosophy: The 2am Debug Story

**Imagine it's 2am. You're on-call. Alerts are firing. Ask yourself:**

- Can I **understand what's happening** without SSH'ing into servers? (Observability)
- Can I **stop the bleeding** quickly? (Runbooks, feature flags, rollback)
- Will this **fail safely** or cascade? (Circuit breakers, timeouts, rate limits)
- Can I **restore user data** if corrupted? (Backups, audit logs, rollback)
- Will I **leak secrets** while debugging? (Secrets management, PII redaction)
- Can I **scale this** when traffic spikes 10x? (Load testing, autoscaling)

**If the answer to any is "no", your service isn't production-ready.**

## Step 1: Understand the Service

If `FEATURE` and `SCOPE` provided, parse them. Otherwise, ask:

**Interactive prompts:**
1. **What service/feature are you evaluating?**
2. **What's the criticality?** (tier 0 = core revenue, tier 1 = important, tier 2 = nice-to-have)
3. **What's the user-facing impact of failure?** (revenue loss, data loss, security breach, UX degradation)
4. **What's the current deployment stage?** (dev, staging, canary, production)
5. **What are the dependencies?** (databases, APIs, queues, third-party services)

**Gather context:**
- Service architecture diagram
- API contracts
- Database schema
- Infrastructure (Kubernetes, EC2, serverless)
- Monitoring dashboards
- Existing runbooks

## Step 2: Production Readiness Checklist

Evaluate across **7 categories**. Each item gets a status:
- ✅ **PASS**: Meets production standards
- ⚠️ **WARN**: Works but needs improvement
- ❌ **FAIL**: Blocker for production
- ⏭️ **SKIP**: Not applicable

### Category 1: Observability (Can you debug at 2am?)

**The 2am question:** *"Can I understand what's happening without SSH or asking developers?"*

#### Logs with Correlation IDs

**Required:**
- [ ] Structured JSON logs (not string concatenation)
- [ ] Request ID in every log (propagate across services)
- [ ] User ID / session ID for user-facing requests
- [ ] Trace ID for distributed tracing
- [ ] Log level appropriate (ERROR for failures, WARN for degradation, INFO for business events)
- [ ] No secrets or PII in logs
- [ ] Wide-event format (comprehensive events, not scattered logs)

**Example: Wide-event logging**
```typescript
// ❌ FAIL: Scattered logs, missing correlation
app.post('/api/payment', async (req, res) => {
  console.log('Payment received');
  const result = await processPayment(req.body);
  console.log('Payment processed');
  res.json(result);
});

// ✅ PASS: Wide-event with full context
import { logger } from './logger';

app.post('/api/payment', async (req, res) => {
  const requestId = req.headers['x-request-id'] || generateId();
  const startTime = Date.now();

  try {
    const result = await processPayment(req.body);

    // Emit ONE comprehensive event after completion
    logger.info('payment_processed', {
      request_id: requestId,
      user_id: req.user.id,
      trace_id: req.headers['x-trace-id'],
      amount_cents: req.body.amount,
      currency: req.body.currency,
      payment_method: req.body.method,
      status: 'success',
      duration_ms: Date.now() - startTime,

      // Business context
      user_tier: req.user.subscription,
      cart_value: req.body.cart_total,
      payment_processor: 'stripe',

      // Feature flags
      flags: {
        new_checkout: req.user.hasFlag('new_checkout'),
        fraud_detection_v2: req.user.hasFlag('fraud_v2'),
      },
    });

    res.json(result);
  } catch (error) {
    logger.error('payment_failed', {
      request_id: requestId,
      user_id: req.user.id,
      trace_id: req.headers['x-trace-id'],
      amount_cents: req.body.amount,
      currency: req.body.currency,
      error_type: error.constructor.name,
      error_message: error.message,
      error_code: error.code,
      duration_ms: Date.now() - startTime,

      // Context for debugging
      payment_processor: 'stripe',
      user_tier: req.user.subscription,
    });

    res.status(500).json({ error: 'Payment failed' });
  }
});
```

**Wide-event benefits:**
- Single query to find slow/failed payments: `status=failed duration_ms>5000`
- Correlate across services: search by `request_id`
- Business analytics: `sum(amount_cents) where user_tier=premium`
- No scattered logs to correlate manually

#### Metrics with Alerts

**Required:**
- [ ] Golden signals: latency (p50, p95, p99), error rate, throughput
- [ ] Business metrics: revenue, signups, conversions
- [ ] Resource metrics: CPU, memory, disk, network
- [ ] Dependency metrics: database query time, API call latency
- [ ] Alerts on ALL critical metrics (not just dashboards)
- [ ] Alert thresholds tested (not guessed)
- [ ] Alert runbooks (what to do when alert fires)

**Example: Metrics with alerts**
```typescript
import { metrics } from './metrics';

// ❌ FAIL: No metrics
app.post('/api/payment', async (req, res) => {
  const result = await processPayment(req.body);
  res.json(result);
});

// ✅ PASS: Golden signals + business metrics
app.post('/api/payment', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await processPayment(req.body);

    // Golden signals
    metrics.histogram('payment.duration_ms', Date.now() - startTime, {
      status: 'success',
      payment_method: req.body.method,
    });
    metrics.increment('payment.count', 1, {
      status: 'success',
      payment_method: req.body.method,
    });

    // Business metrics
    metrics.histogram('payment.amount_cents', req.body.amount, {
      currency: req.body.currency,
      user_tier: req.user.subscription,
    });

    res.json(result);
  } catch (error) {
    metrics.increment('payment.count', 1, {
      status: 'error',
      error_type: error.constructor.name,
    });

    throw error;
  }
});
```

**Alert configuration (Datadog example):**
```yaml
# alerts/payment-api.yaml
- name: "Payment API - High Error Rate"
  query: "sum(last_5m):sum:payment.count{status:error}.as_count() / sum:payment.count{*}.as_count() > 0.05"
  message: |
    Payment API error rate is {{value}}% (threshold: 5%).

    Runbook: https://wiki.company.com/runbooks/payment-api-errors

    Check:
    1. Datadog dashboard: https://app.datadoghq.com/dashboard/payment-api
    2. Recent deploys: kubectl rollout history deployment/payment-api
    3. Stripe status: https://status.stripe.com

    @pagerduty-payments @slack-payments-alerts
  thresholds:
    critical: 0.05  # 5% error rate
    warning: 0.02   # 2% error rate

- name: "Payment API - High Latency (p95)"
  query: "avg(last_5m):p95:payment.duration_ms{*} > 2000"
  message: |
    Payment API p95 latency is {{value}}ms (threshold: 2000ms).

    Runbook: https://wiki.company.com/runbooks/payment-api-latency
    @pagerduty-payments
  thresholds:
    critical: 2000  # 2 seconds
    warning: 1000   # 1 second

- name: "Payment Revenue Drop"
  query: "sum(last_15m):sum:payment.amount_cents{*} < 100000"
  message: |
    Payment revenue dropped to ${{value}} in last 15m (threshold: $1000).
    Possible payment outage.

    @pagerduty-payments-urgent @slack-exec-alerts
  thresholds:
    critical: 100000  # $1000 in 15 minutes
```

#### Distributed Tracing

**Required:**
- [ ] Trace context propagated across services (OpenTelemetry, Jaeger, Zipkin)
- [ ] Database queries in traces
- [ ] External API calls in traces
- [ ] Error traces captured
- [ ] Sampling configured (100% for errors, 1-10% for success)

**Example: OpenTelemetry tracing**
```typescript
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('payment-api');

app.post('/api/payment', async (req, res) => {
  // Create root span
  const span = tracer.startSpan('POST /api/payment', {
    attributes: {
      'http.method': 'POST',
      'http.url': req.url,
      'http.user_agent': req.headers['user-agent'],
      'user.id': req.user.id,
    },
  });

  try {
    // Child span for payment processing
    const processSpan = tracer.startSpan('processPayment', {
      parent: span,
      attributes: {
        'payment.amount': req.body.amount,
        'payment.currency': req.body.currency,
      },
    });

    const result = await processPayment(req.body);
    processSpan.setStatus({ code: SpanStatusCode.OK });
    processSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });
    span.setAttribute('http.status_code', 200);
    res.json(result);
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
});
```

**Observability gaps that cause 2am incidents:**
- ❌ No logs: *"I have no idea what's happening"*
- ❌ No correlation IDs: *"I see errors but can't trace the request flow"*
- ❌ No metrics: *"Is this slow, or just feels slow?"*
- ❌ No alerts: *"Nobody knew we were down for 2 hours"*
- ❌ Metrics without alerts: *"We have dashboards but I was asleep"*

### Category 2: Safety Patterns (Will this fail gracefully?)

**The 2am question:** *"Will this cascade and take down the whole system?"*

#### Timeouts

**Required:**
- [ ] ALL external calls have timeouts
- [ ] Timeouts < user-facing timeout (leave time for retries)
- [ ] Timeout errors logged with context
- [ ] No infinite waits

**Example: Timeout configuration**
```typescript
import axios from 'axios';

// ❌ FAIL: No timeout
async function callPaymentAPI(data: PaymentData) {
  const response = await axios.post('https://api.stripe.com/v1/charges', data);
  return response.data;
}
// Risk: Stripe is down, requests hang forever, all connections exhausted

// ✅ PASS: Aggressive timeout
async function callPaymentAPI(data: PaymentData) {
  try {
    const response = await axios.post('https://api.stripe.com/v1/charges', data, {
      timeout: 5000, // 5 second timeout
    });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      logger.error('payment_api_timeout', {
        timeout_ms: 5000,
        payment_amount: data.amount,
      });
      metrics.increment('payment.timeout', 1);
      throw new PaymentTimeoutError('Payment API timeout');
    }
    throw error;
  }
}
```

**Timeout hierarchy:**
```
User-facing timeout: 30 seconds (API gateway)
  ├─ Service timeout: 25 seconds (leave 5s for retries)
  │   ├─ Database timeout: 10 seconds
  │   ├─ Payment API timeout: 5 seconds
  │   └─ Cache timeout: 1 second
```

#### Retries with Backoff

**Required:**
- [ ] Idempotent operations have retries
- [ ] Exponential backoff (not fixed delay)
- [ ] Max retry limit (3-5 retries)
- [ ] Jitter to prevent thundering herd
- [ ] Retries logged

**Example: Exponential backoff with jitter**
```typescript
// ❌ FAIL: No retries
async function callAPI(url: string) {
  return await fetch(url);
}

// ⚠️ WARN: Retries without backoff (thundering herd)
async function callAPI(url: string) {
  for (let i = 0; i < 3; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (i === 2) throw error;
      await sleep(1000); // Fixed 1s delay - all clients retry at once
    }
  }
}

// ✅ PASS: Exponential backoff with jitter
async function callAPIWithRetry(url: string, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, { timeout: 5000 });

      if (!response.ok && response.status >= 500 && attempt < maxRetries - 1) {
        // Retry 5xx errors
        throw new Error(`HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) {
        logger.error('api_call_failed_after_retries', {
          url,
          attempts: maxRetries,
          error: error.message,
        });
        throw error;
      }

      // Exponential backoff: 100ms, 200ms, 400ms, 800ms
      const baseDelay = 100 * Math.pow(2, attempt);

      // Add jitter ±25% to prevent thundering herd
      const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1);
      const delay = baseDelay + jitter;

      logger.warn('api_call_retry', {
        url,
        attempt: attempt + 1,
        max_retries: maxRetries,
        delay_ms: Math.round(delay),
        error: error.message,
      });

      await sleep(delay);
    }
  }
}
```

#### Circuit Breakers

**Required:**
- [ ] Circuit breakers on ALL external dependencies
- [ ] Configurable thresholds (error rate, timeout)
- [ ] Half-open state for recovery testing
- [ ] Circuit state exposed in metrics
- [ ] Fallback behavior defined

**Example: Circuit breaker pattern**
```typescript
import CircuitBreaker from 'opossum';

// ❌ FAIL: No circuit breaker
async function getRecommendations(userId: string) {
  const response = await fetch(`https://ml-api.internal/recommendations/${userId}`);
  return response.json();
}
// Risk: ML API is down, every request tries and times out, cascading failure

// ✅ PASS: Circuit breaker with fallback
const recommendationBreaker = new CircuitBreaker(
  async (userId: string) => {
    const response = await fetch(
      `https://ml-api.internal/recommendations/${userId}`,
      { timeout: 2000 }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
  },
  {
    timeout: 3000,              // 3s timeout
    errorThresholdPercentage: 50, // Open circuit at 50% error rate
    resetTimeout: 30000,        // Try to close after 30s
    volumeThreshold: 10,        // Need 10 requests before calculating error rate
  }
);

// Monitor circuit state
recommendationBreaker.on('open', () => {
  logger.error('circuit_breaker_opened', { circuit: 'recommendations' });
  metrics.gauge('circuit_breaker.state', 1, { circuit: 'recommendations' });
});

recommendationBreaker.on('halfOpen', () => {
  logger.warn('circuit_breaker_half_open', { circuit: 'recommendations' });
  metrics.gauge('circuit_breaker.state', 0.5, { circuit: 'recommendations' });
});

recommendationBreaker.on('close', () => {
  logger.info('circuit_breaker_closed', { circuit: 'recommendations' });
  metrics.gauge('circuit_breaker.state', 0, { circuit: 'recommendations' });
});

// Fallback behavior
async function getRecommendations(userId: string): Promise<Recommendation[]> {
  try {
    return await recommendationBreaker.fire(userId);
  } catch (error) {
    // Circuit open or API error - return fallback
    logger.warn('recommendations_fallback', {
      user_id: userId,
      error: error.message,
    });

    // Fallback: popular items
    return getPopularItems();
  }
}
```

**Circuit breaker states:**
```
CLOSED (normal operation)
  ├─ Error rate < 50% → Stay CLOSED
  └─ Error rate > 50% → Open circuit

OPEN (failing fast)
  ├─ All requests fail immediately (no API calls)
  ├─ Return fallback response
  └─ After 30s → Try HALF_OPEN

HALF_OPEN (testing recovery)
  ├─ Allow 1 request through
  ├─ If succeeds → Close circuit
  └─ If fails → Re-open circuit
```

#### Rate Limiting

**Required:**
- [ ] Rate limits on public APIs
- [ ] Rate limits per user/tenant
- [ ] Rate limit headers (X-RateLimit-Limit, X-RateLimit-Remaining)
- [ ] 429 responses for rate limit exceeded
- [ ] Rate limit bypass for internal services

**Example: Rate limiting**
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// ❌ FAIL: No rate limiting
app.post('/api/payment', async (req, res) => {
  // Anyone can spam payments
  const result = await processPayment(req.body);
  res.json(result);
});

// ✅ PASS: Per-user rate limiting
const paymentLimiter = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'rate_limit:payment:',
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 payments per minute per user
  keyGenerator: (req) => req.user.id,
  handler: (req, res) => {
    logger.warn('rate_limit_exceeded', {
      user_id: req.user.id,
      endpoint: '/api/payment',
      limit: 10,
      window_ms: 60000,
    });

    res.status(429).json({
      error: 'Rate limit exceeded',
      retry_after: 60,
    });
  },
  standardHeaders: true, // X-RateLimit-* headers
  legacyHeaders: false,
});

app.post('/api/payment', paymentLimiter, async (req, res) => {
  const result = await processPayment(req.body);
  res.json(result);
});

// Tiered rate limiting (higher limits for premium users)
const getTierLimit = (user: User) => {
  if (user.subscription === 'enterprise') return 1000;
  if (user.subscription === 'premium') return 100;
  return 10;
};

const dynamicLimiter = rateLimit({
  store: new RedisStore({ client: redis }),
  windowMs: 60 * 1000,
  max: (req) => getTierLimit(req.user),
  keyGenerator: (req) => req.user.id,
});
```

**Safety patterns summary:**
- ✅ **Timeouts**: Fail fast instead of hanging
- ✅ **Retries**: Recover from transient failures
- ✅ **Circuit breakers**: Stop cascading failures
- ✅ **Rate limiting**: Prevent abuse and overload

### Category 3: Runbooks (Can you fix it at 2am?)

**The 2am question:** *"Can I fix this half-asleep without escalating?"*

**Required:**
- [ ] Runbook for each alert
- [ ] Runbook for common failure modes
- [ ] Exact commands (copy-paste ready)
- [ ] Rollback procedure
- [ ] Escalation path

**Example: Payment API Runbook**

```markdown
# Runbook: Payment API High Error Rate

**Alert:** Payment API error rate > 5% for 5 minutes
**Severity:** SEV-1 (revenue impacting)
**On-call:** @pagerduty-payments

## Quick Context

**What it means:** Users can't complete payments, revenue is blocked.

**Common causes:**
1. Stripe API outage (50% of incidents)
2. Database connection pool exhausted (30%)
3. Bad deployment (20%)

## Step 1: Assess Impact (2 minutes)

**Check dashboards:**
- Payment dashboard: https://app.datadoghq.com/dashboard/payment-api
- Stripe status: https://status.stripe.com

**Query logs:**
```bash
# Get error breakdown (last 5 minutes)
kubectl logs -l app=payment-api --since=5m | \
  jq -r 'select(.level=="error") | .error_type' | \
  sort | uniq -c | sort -rn

# Get affected users
kubectl logs -l app=payment-api --since=5m | \
  jq -r 'select(.level=="error") | .user_id' | \
  sort -u | wc -l
```

**Expected output:**
```
  45 StripeTimeoutError
  12 DatabaseConnectionError
   3 ValidationError

34 affected users (last 5 minutes)
```

## Step 2: Identify Root Cause (5 minutes)

### Scenario A: Stripe API Issues

**Check Stripe status:**
```bash
curl -s https://status.stripe.com/api/v2/status.json | jq .
```

**If Stripe is down:**
- This is external, nothing we can do
- Enable "maintenance mode" to stop retry storms:
  ```bash
  kubectl set env deployment/payment-api STRIPE_ENABLED=false
  ```
- Notify users via status page
- Skip to Step 4 (Monitor)

### Scenario B: Database Connection Pool Exhausted

**Check connection pool:**
```bash
kubectl exec -it deployment/payment-api -- node -e "
  const db = require('./db');
  console.log('Pool:', db.pool.totalCount, 'total,',
              db.pool.idleCount, 'idle');
"
```

**If pool exhausted (0 idle connections):**
```bash
# Check for slow queries
kubectl exec -it postgres-primary -- psql -U postgres -c "
  SELECT pid, age(clock_timestamp(), query_start), state, query
  FROM pg_stat_activity
  WHERE state != 'idle'
  ORDER BY age DESC
  LIMIT 10;
"

# If you find slow queries, kill them (CAREFULLY!)
kubectl exec -it postgres-primary -- psql -U postgres -c "
  SELECT pg_terminate_backend(PID_HERE);
"

# Restart payment API to reset connections
kubectl rollout restart deployment/payment-api
```

### Scenario C: Bad Deployment

**Check recent deployments:**
```bash
kubectl rollout history deployment/payment-api

# Get last 3 deployments with timestamps
kubectl rollout history deployment/payment-api | tail -3
```

**If deployment was in last 15 minutes:**
```bash
# ROLLBACK IMMEDIATELY
kubectl rollout undo deployment/payment-api

# Monitor rollback
kubectl rollout status deployment/payment-api

# Verify error rate drops
# Check dashboard: https://app.datadoghq.com/dashboard/payment-api
```

## Step 3: Mitigate (10 minutes)

**If root cause unclear, reduce blast radius:**

**Option 1: Scale up (buy time for debugging)**
```bash
kubectl scale deployment/payment-api --replicas=10
```

**Option 2: Rollback to last known good**
```bash
kubectl rollout undo deployment/payment-api
```

**Option 3: Enable circuit breaker**
```bash
# Temporarily disable Stripe calls, use fallback
kubectl set env deployment/payment-api STRIPE_CIRCUIT_BREAKER_THRESHOLD=0
```

## Step 4: Monitor Recovery (15 minutes)

**Watch metrics:**
```bash
# Stream error logs
kubectl logs -f -l app=payment-api | jq 'select(.level=="error")'

# Check error rate every 30s
watch -n 30 'kubectl logs -l app=payment-api --since=5m | \
  jq -r "select(.event==\"payment_processed\") | .status" | \
  awk "{total++; if (\$1==\"error\") errors++}
       END {print \"Error rate:\", (errors/total*100)\"%\"}"'
```

**Success criteria:**
- Error rate < 2% for 5 minutes
- No alerts firing
- Payment volume returns to baseline

## Step 5: Document & Escalate

**If NOT resolved in 15 minutes:**
1. Escalate to engineering lead: @slack-eng-lead
2. Start incident channel: `/incident create SEV-1 Payment API down`
3. Document timeline in incident doc

**After resolution:**
1. Update incident ticket with timeline
2. Schedule post-mortem (within 48h)
3. Create action items for prevention

## Quick Reference

**Useful commands:**
```bash
# Logs from last 5 minutes
kubectl logs -l app=payment-api --since=5m

# Logs for specific request
kubectl logs -l app=payment-api | grep "request_id=abc123"

# Restart service
kubectl rollout restart deployment/payment-api

# Rollback to previous version
kubectl rollout undo deployment/payment-api

# Scale up
kubectl scale deployment/payment-api --replicas=10

# Check Stripe status
curl https://status.stripe.com/api/v2/status.json | jq .
```

**Escalation:**
- Engineering lead: @alice (555-0100)
- Database admin: @bob (555-0101)
- Stripe support: https://support.stripe.com (incident priority)
```

**Runbook template:**
```markdown
# Runbook: [Alert Name]

**Alert:** [Alert query/condition]
**Severity:** [SEV-0/1/2/3]
**On-call:** [Team/PagerDuty]

## Quick Context
- What this alert means
- Common causes (with percentages if known)
- Impact on users

## Step 1: Assess Impact (X minutes)
- Dashboards to check
- Queries to run
- Expected output

## Step 2: Identify Root Cause (Y minutes)
- Scenario A: [Most common cause]
  - How to verify
  - How to fix

- Scenario B: [Second common cause]
  - How to verify
  - How to fix

## Step 3: Mitigate (Z minutes)
- If root cause unclear
- Reduce blast radius
- Buy time for debugging

## Step 4: Monitor Recovery
- Metrics to watch
- Success criteria

## Step 5: Document & Escalate
- When to escalate
- Who to escalate to
- Post-incident process

## Quick Reference
- Useful commands (copy-paste ready)
- Escalation contacts
```

### Category 4: Data Safety (Can you recover from data loss?)

**The 2am question:** *"If I corrupt user data, can I restore it?"*

#### Backups

**Required:**
- [ ] Automated backups (daily at minimum)
- [ ] Backup tested (restore drills quarterly)
- [ ] Point-in-time recovery available
- [ ] Backup retention policy (30 days minimum)
- [ ] Backups encrypted
- [ ] Backup monitoring (alert if backup fails)

**Example: PostgreSQL backup configuration**
```yaml
# k8s/postgres-backup-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
spec:
  schedule: "0 2 * * *"  # 2 AM daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15
            env:
            - name: PGHOST
              value: postgres-primary
            - name: PGUSER
              valueFrom:
                secretKeyRef:
                  name: postgres-creds
                  key: username
            - name: PGPASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-creds
                  key: password
            - name: AWS_ACCESS_KEY_ID
              valueFrom:
                secretKeyRef:
                  name: s3-creds
                  key: access_key
            - name: AWS_SECRET_ACCESS_KEY
              valueFrom:
                secretKeyRef:
                  name: s3-creds
                  key: secret_key
            command:
            - /bin/bash
            - -c
            - |
              set -euo pipefail

              BACKUP_FILE="postgres-$(date +%Y%m%d-%H%M%S).sql.gz"

              echo "Starting backup: $BACKUP_FILE"

              # Create backup with progress
              pg_dump --verbose --format=custom postgres | \
                gzip > "/tmp/$BACKUP_FILE"

              # Upload to S3
              aws s3 cp "/tmp/$BACKUP_FILE" \
                "s3://company-backups/postgres/$BACKUP_FILE"

              # Verify upload
              aws s3 ls "s3://company-backups/postgres/$BACKUP_FILE"

              echo "Backup complete: $BACKUP_FILE"

              # Send metrics
              curl -X POST https://metrics.company.com/api/v1/metrics \
                -d "{\"metric\":\"backup.success\",\"value\":1,\"tags\":[\"db:postgres\"]}"
          restartPolicy: OnFailure
```

**Backup restoration procedure:**
```bash
# Restore from latest backup
LATEST_BACKUP=$(aws s3 ls s3://company-backups/postgres/ | \
  sort | tail -1 | awk '{print $4}')

echo "Restoring from: $LATEST_BACKUP"

# Download backup
aws s3 cp "s3://company-backups/postgres/$LATEST_BACKUP" /tmp/backup.sql.gz

# Restore (DESTRUCTIVE - use with caution!)
gunzip < /tmp/backup.sql.gz | pg_restore --verbose --clean --if-exists \
  -h postgres-primary -U postgres -d postgres

# Verify restoration
psql -h postgres-primary -U postgres -d postgres -c "\dt"
```

**Backup monitoring:**
```typescript
// scripts/verify-backup.ts
import { S3 } from 'aws-sdk';
import { metrics } from './metrics';

const s3 = new S3();

async function verifyBackup() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const prefix = `postgres-${yesterday.toISOString().slice(0, 10)}`;

  const backups = await s3.listObjectsV2({
    Bucket: 'company-backups',
    Prefix: `postgres/${prefix}`,
  }).promise();

  if (!backups.Contents || backups.Contents.length === 0) {
    metrics.increment('backup.missing', 1, { db: 'postgres' });

    // Alert on-call
    await fetch('https://hooks.slack.com/services/XXX', {
      method: 'POST',
      body: JSON.stringify({
        text: `🚨 Missing PostgreSQL backup for ${yesterday.toISOString().slice(0, 10)}`,
        channel: '#alerts-database',
      }),
    });

    process.exit(1);
  }

  const latestBackup = backups.Contents[0];
  const ageHours = (Date.now() - latestBackup.LastModified.getTime()) / 1000 / 60 / 60;

  metrics.gauge('backup.age_hours', ageHours, { db: 'postgres' });
  metrics.gauge('backup.size_mb', latestBackup.Size / 1024 / 1024, { db: 'postgres' });

  console.log(`✅ Backup verified: ${latestBackup.Key} (${ageHours.toFixed(1)}h old)`);
}

verifyBackup().catch(console.error);
```

#### Audit Logs

**Required:**
- [ ] Audit log for data mutations
- [ ] Who, what, when for all changes
- [ ] Immutable logs (append-only)
- [ ] Audit log retention (1 year minimum)
- [ ] Audit log monitoring

**Example: Audit logging**
```typescript
// ❌ FAIL: No audit trail
app.post('/api/users/:id/balance', async (req, res) => {
  await db.query(
    'UPDATE users SET balance = $1 WHERE id = $2',
    [req.body.balance, req.params.id]
  );

  res.json({ success: true });
});
// Problem: No record of who changed the balance, or why

// ✅ PASS: Full audit trail
app.post('/api/users/:id/balance', async (req, res) => {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // Get current balance
    const current = await client.query(
      'SELECT balance FROM users WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    // Update balance
    await client.query(
      'UPDATE users SET balance = $1, updated_at = NOW() WHERE id = $2',
      [req.body.balance, req.params.id]
    );

    // Write audit log
    await client.query(
      `INSERT INTO audit_log (
        event_type, user_id, actor_id,
        old_value, new_value, reason, ip_address,
        request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        'balance_update',
        req.params.id,
        req.user.id,
        current.rows[0].balance,
        req.body.balance,
        req.body.reason || 'manual_adjustment',
        req.ip,
        req.headers['x-request-id'],
      ]
    );

    await client.query('COMMIT');

    logger.info('balance_updated', {
      user_id: req.params.id,
      actor_id: req.user.id,
      old_balance: current.rows[0].balance,
      new_balance: req.body.balance,
      reason: req.body.reason,
    });

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Query audit log
app.get('/api/audit-log/user/:id', async (req, res) => {
  const logs = await db.query(
    `SELECT
      event_type, actor_id, old_value, new_value,
      reason, created_at
    FROM audit_log
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 100`,
    [req.params.id]
  );

  res.json(logs.rows);
});
```

**Audit log schema:**
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- What happened
  event_type VARCHAR(100) NOT NULL,

  -- Who was affected
  user_id VARCHAR(100),
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),

  -- Who did it
  actor_id VARCHAR(100) NOT NULL,
  actor_type VARCHAR(50) NOT NULL DEFAULT 'user',

  -- What changed
  old_value JSONB,
  new_value JSONB,

  -- Why
  reason TEXT,

  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),

  -- Immutability
  CHECK (created_at <= NOW())
);

-- Prevent updates/deletes (append-only)
CREATE RULE audit_log_immutable AS
  ON UPDATE TO audit_log DO INSTEAD NOTHING;

CREATE RULE audit_log_no_delete AS
  ON DELETE TO audit_log DO INSTEAD NOTHING;

-- Indexes for common queries
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_id, created_at DESC);
CREATE INDEX idx_audit_log_event ON audit_log(event_type, created_at DESC);
```

#### Migration Safety

**Required:**
- [ ] Migrations tested on production-like data
- [ ] Migrations reversible (down migration)
- [ ] Zero-downtime migrations (no table locks)
- [ ] Migration monitoring (duration, rows affected)
- [ ] Rollback procedure tested

**Example: Zero-downtime migration**
```typescript
// ❌ FAIL: Blocking migration
export async function up(db: Database) {
  // Locks table, blocks all writes
  await db.schema.alterTable('users', (table) => {
    table.string('email').notNullable();
  });
}

// ✅ PASS: Zero-downtime migration
export async function up(db: Database) {
  // Step 1: Add column as nullable (no lock)
  await db.schema.alterTable('users', (table) => {
    table.string('email').nullable();
  });

  // Step 2: Backfill in batches (avoid long transactions)
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const users = await db('users')
      .whereNull('email')
      .limit(batchSize)
      .offset(offset);

    if (users.length === 0) break;

    for (const user of users) {
      await db('users')
        .where('id', user.id)
        .update({ email: `${user.username}@example.com` });
    }

    console.log(`Backfilled ${offset + users.length} users`);
    offset += batchSize;

    // Sleep to avoid overloading database
    await sleep(100);
  }

  // Step 3: Add NOT NULL constraint (validates all rows)
  await db.schema.alterTable('users', (table) => {
    table.string('email').notNullable().alter();
  });
}

export async function down(db: Database) {
  await db.schema.alterTable('users', (table) => {
    table.dropColumn('email');
  });
}
```

**Migration monitoring:**
```typescript
// migrations/wrapper.ts
import { logger } from './logger';
import { metrics } from './metrics';

export async function runMigration(
  name: string,
  up: (db: Database) => Promise<void>
) {
  const startTime = Date.now();

  logger.info('migration_started', { migration: name });

  try {
    await up(db);

    const duration = Date.now() - startTime;

    logger.info('migration_completed', {
      migration: name,
      duration_ms: duration,
    });

    metrics.histogram('migration.duration_ms', duration, {
      migration: name,
      status: 'success',
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error('migration_failed', {
      migration: name,
      duration_ms: duration,
      error: error.message,
    });

    metrics.increment('migration.failure', 1, { migration: name });

    throw error;
  }
}
```

### Category 5: Security (Will this leak secrets?)

**The 2am question:** *"If this breaks, will we leak passwords or PII?"*

#### Secrets Management

**Required:**
- [ ] No secrets in code (no `password = "abc123"`)
- [ ] No secrets in environment variables (visible in `ps`)
- [ ] Secrets in secret manager (AWS Secrets Manager, Vault, K8s Secrets)
- [ ] Secrets rotated (quarterly at minimum)
- [ ] Secrets encrypted at rest and in transit

**Example: Secrets management**
```typescript
// ❌ FAIL: Hardcoded secrets
const stripe = new Stripe('sk_live_abc123_HARDCODED_SECRET');

// ❌ FAIL: Secrets in environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// Problem: Visible in `ps auxe`, logged in error reports

// ✅ PASS: Secrets from secret manager
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string): Promise<string> {
  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  return response.SecretString!;
}

// Cache secrets (don't fetch on every request)
let stripeKey: string | null = null;

async function getStripeClient(): Promise<Stripe> {
  if (!stripeKey) {
    stripeKey = await getSecret('production/stripe/secret_key');
  }

  return new Stripe(stripeKey);
}

// Refresh secrets periodically (handle rotation)
setInterval(async () => {
  logger.info('refreshing_secrets');
  stripeKey = null; // Force refresh on next request
}, 60 * 60 * 1000); // Every hour
```

**Kubernetes secrets:**
```yaml
# k8s/secrets.yaml (encrypted with SOPS or sealed-secrets)
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  stripe-key: c2tfdGVzdF9hYmMxMjM=  # base64 encoded
  db-password: cGFzc3dvcmQxMjM=

---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-api
spec:
  template:
    spec:
      containers:
      - name: app
        image: payment-api:latest
        env:
        - name: STRIPE_SECRET_KEY
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: stripe-key
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: db-password
```

#### PII Protection

**Required:**
- [ ] PII encrypted at rest (database encryption)
- [ ] PII encrypted in transit (TLS)
- [ ] PII redacted in logs
- [ ] PII access logged (audit trail)
- [ ] PII deletion on user request (GDPR)

**Example: PII protection**
```typescript
// ❌ FAIL: PII in logs
logger.info('user_login', {
  email: user.email,
  name: user.full_name,
  ip: req.ip,
});

// ✅ PASS: PII hashed or omitted
import crypto from 'crypto';

function hashPII(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

logger.info('user_login', {
  user_id: user.id,
  email_hash: hashPII(user.email),
  country: user.country, // Aggregated location OK
  // Don't log email, name, IP
});
```

**Database encryption:**
```typescript
// Use encryption at rest (AWS RDS, Google Cloud SQL)
// Use application-level encryption for sensitive fields

import crypto from 'crypto';

const ENCRYPTION_KEY = await getSecret('production/encryption/key');

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    ENCRYPTION_KEY,
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// Store encrypted SSN
await db.query(
  'INSERT INTO users (id, ssn_encrypted) VALUES ($1, $2)',
  [user.id, encrypt(user.ssn)]
);

// Retrieve and decrypt
const result = await db.query(
  'SELECT ssn_encrypted FROM users WHERE id = $1',
  [user.id]
);

const ssn = decrypt(result.rows[0].ssn_encrypted);
```

#### Authentication & Authorization

**Required:**
- [ ] All endpoints authenticated (no public APIs without auth)
- [ ] Authorization checked (user can access this resource)
- [ ] Rate limiting on auth endpoints
- [ ] Auth failures logged
- [ ] Session expiry

**Example: Authentication middleware**
```typescript
// ❌ FAIL: No authentication
app.post('/api/payment', async (req, res) => {
  const result = await processPayment(req.body);
  res.json(result);
});

// ✅ PASS: Authentication + authorization
import jwt from 'jsonwebtoken';

async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    logger.warn('auth_missing', {
      ip: req.ip,
      endpoint: req.path,
    });

    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, await getSecret('jwt_secret'));

    req.user = await db.query(
      'SELECT id, email, subscription FROM users WHERE id = $1',
      [decoded.userId]
    ).then(r => r.rows[0]);

    if (!req.user) {
      throw new Error('User not found');
    }

    logger.info('auth_success', {
      user_id: req.user.id,
      endpoint: req.path,
    });

    next();
  } catch (error) {
    logger.warn('auth_failed', {
      ip: req.ip,
      endpoint: req.path,
      error: error.message,
    });

    metrics.increment('auth.failure', 1, {
      reason: error.name,
    });

    res.status(401).json({ error: 'Invalid token' });
  }
}

function authorize(...requiredRoles: string[]) {
  return (req, res, next) => {
    if (!requiredRoles.includes(req.user.subscription)) {
      logger.warn('authz_failed', {
        user_id: req.user.id,
        user_role: req.user.subscription,
        required_roles: requiredRoles,
        endpoint: req.path,
      });

      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

// Apply auth middleware
app.post('/api/payment',
  authenticate,
  authorize('premium', 'enterprise'),
  async (req, res) => {
    const result = await processPayment(req.body);
    res.json(result);
  }
);
```

### Category 6: Capacity & Scaling (Can this handle 10x traffic?)

**The 2am question:** *"What happens if we get 10x traffic right now?"*

**Required:**
- [ ] Load tested (10x current traffic)
- [ ] Autoscaling configured
- [ ] Resource limits set (prevent OOM)
- [ ] Database connection pooling
- [ ] Caching for hot paths

**Example: Autoscaling configuration**
```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payment-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payment-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "1000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
```

**Load testing:**
```typescript
// load-test/payment-api.ts
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp to 100 users
    { duration: '5m', target: 100 },   // Stay at 100
    { duration: '2m', target: 500 },   // Spike to 500
    { duration: '5m', target: 500 },   // Stay at 500
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% under 2s
    'http_req_failed': ['rate<0.05'],    // Error rate < 5%
  },
};

export default function () {
  const payload = JSON.stringify({
    amount: 1000,
    currency: 'usd',
    method: 'card',
  });

  const response = http.post('https://api.company.com/payment', payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${__ENV.API_TOKEN}`,
    },
  });

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
  });

  sleep(1);
}
```

### Category 7: Incident Response (Can you handle an outage?)

**The 2am question:** *"Who do I call, and what do I tell them?"*

**Required:**
- [ ] On-call rotation configured
- [ ] PagerDuty/OpsGenie alerts
- [ ] Escalation policy (L1 → L2 → Engineering Lead)
- [ ] Status page for external communication
- [ ] Incident response plan

**Example: Incident response plan**
```markdown
# Incident Response Plan

## Severity Levels

**SEV-0: Critical (all hands on deck)**
- Complete outage (users can't access service)
- Data loss or corruption
- Security breach
- Response time: 5 minutes
- Escalation: @pagerduty-sev0 (CEO, CTO, all engineers)

**SEV-1: High (urgent)**
- Major functionality down (e.g., payments)
- Severe performance degradation
- Revenue impact
- Response time: 15 minutes
- Escalation: @pagerduty-sev1 (on-call, engineering lead)

**SEV-2: Medium (important)**
- Minor functionality degraded
- Non-revenue impacting
- Response time: 1 hour
- Escalation: @pagerduty-sev2 (on-call)

**SEV-3: Low (can wait)**
- Minor issues, cosmetic bugs
- Response time: Next business day
- No escalation

## Incident Workflow

1. **Detect** (automated alerts)
   - PagerDuty sends alert to on-call
   - On-call acknowledges within 5 minutes

2. **Assess** (severity, impact)
   - What's broken?
   - How many users affected?
   - Revenue impact?
   - Assign severity level

3. **Communicate** (internal and external)
   - Create Slack incident channel: `/incident create SEV-X [description]`
   - Post to status page: https://status.company.com
   - Notify stakeholders (customer support, sales, exec)

4. **Mitigate** (stop the bleeding)
   - Rollback bad deploy
   - Scale up resources
   - Enable circuit breakers
   - Goal: restore service ASAP (not fix root cause)

5. **Resolve** (incident ended)
   - Service restored
   - Monitoring shows healthy state
   - Mark incident as resolved

6. **Post-Mortem** (within 48h)
   - What happened?
   - Why did it happen?
   - How do we prevent recurrence?
   - Action items with owners

## Communication Templates

**Status page (service degraded):**
```
We are investigating reports of slow response times on the Payment API.
Users may experience delays when checking out.

We are actively working on a fix and will provide updates every 15 minutes.

Last updated: 2024-01-15 14:32 UTC
```

**Status page (outage):**
```
The Payment API is currently unavailable. Users cannot complete purchases.

We have identified the root cause (database connection pool exhaustion)
and are implementing a fix. We expect service to be restored within 30 minutes.

Next update: 2024-01-15 15:00 UTC
```

**Internal Slack (SEV-1):**
```
🚨 SEV-1 INCIDENT: Payment API High Error Rate

Impact: 50% error rate, ~100 affected users/minute
Root cause: Stripe API timeout
Status: Investigating

Incident channel: #incident-2024-01-15-payment
Incident doc: https://docs.company.com/incidents/2024-01-15
On-call: @alice

Timeline:
14:23 UTC - Incident started
14:28 UTC - Alert fired
14:30 UTC - On-call investigating
```
```

## Step 3: Generate Production Readiness Report

Based on checklist evaluation, produce a report:

```markdown
# Production Readiness Report: [Service Name]

**Evaluated:** [Date]
**Service:** [Name]
**Criticality:** Tier [0/1/2]
**Evaluator:** [Name]

## Executive Summary

**Overall status:** [READY / NOT READY / CONDITIONALLY READY]

**Blockers (must fix before production):**
1. [Critical issue 1]
2. [Critical issue 2]

**Warnings (should fix soon):**
1. [Important issue 1]
2. [Important issue 2]

**Estimated time to production-ready:** [X days/weeks]

## Category Scores

| Category | Score | Blockers | Warnings |
|----------|-------|----------|----------|
| Observability | 7/10 | 0 | 3 |
| Safety Patterns | 5/10 | 2 | 1 |
| Runbooks | 3/10 | 1 | 2 |
| Data Safety | 9/10 | 0 | 1 |
| Security | 8/10 | 0 | 2 |
| Capacity | 6/10 | 1 | 1 |
| Incident Response | 7/10 | 0 | 2 |
| **Total** | **45/70** | **4** | **12** |

## Detailed Findings

### Observability (7/10)

**PASS:**
- ✅ Structured JSON logs
- ✅ Request IDs in all logs
- ✅ Metrics for golden signals

**WARN:**
- ⚠️ No distributed tracing
- ⚠️ Alert thresholds not tested
- ⚠️ Missing business metrics

**Recommendations:**
1. Add OpenTelemetry tracing (2 days)
2. Run load test to calibrate alert thresholds (1 day)
3. Add revenue/conversion metrics (1 day)

### Safety Patterns (5/10)

**FAIL:**
- ❌ No timeouts on Stripe API calls
- ❌ No circuit breaker for ML service

**WARN:**
- ⚠️ Retries without exponential backoff

**Recommendations:**
1. Add 5s timeout to all external calls (4 hours)
2. Implement circuit breaker with opossum (1 day)
3. Replace fixed-delay retries with exponential backoff (4 hours)

[Continue for all categories...]

## Action Items

### P0: Must fix before production (blockers)

1. **Add timeouts to external API calls**
   - Owner: @alice
   - Effort: 4 hours
   - Due: 2024-01-16
   - Files: src/services/stripe.ts, src/services/ml.ts

2. **Implement circuit breaker for ML service**
   - Owner: @bob
   - Effort: 1 day
   - Due: 2024-01-17
   - Files: src/services/ml.ts

3. **Create runbook for common incidents**
   - Owner: @charlie
   - Effort: 2 days
   - Due: 2024-01-18
   - Files: docs/runbooks/payment-api.md

4. **Configure autoscaling**
   - Owner: @alice
   - Effort: 1 day
   - Due: 2024-01-17
   - Files: k8s/hpa.yaml

### P1: Should fix soon (warnings)

[List P1 items with owners and estimates...]

### P2: Nice to have

[List P2 improvements...]

## Production Launch Plan

**Prerequisites:**
- [ ] All P0 items completed
- [ ] Load test passed (10x traffic)
- [ ] Backup restoration tested
- [ ] Runbooks reviewed by on-call team
- [ ] Alerts tested (trigger manually)

**Launch stages:**
1. Week 1: Fix all blockers (P0 items)
2. Week 2: Load testing and alert tuning
3. Week 3: Canary deployment (1% traffic)
4. Week 4: Gradual rollout to 100%

**Sign-off:**
- Engineering: [Name, Date]
- SRE: [Name, Date]
- Security: [Name, Date]
```

## Step 4: Follow-Up Actions

After producing the report:

1. **Create tickets** for all P0 and P1 items
2. **Assign owners** with due dates
3. **Schedule review** meeting to discuss findings
4. **Track progress** weekly until production-ready

## Examples

### Example 1: New Payment Service

**Context:**
- New payment processing service
- Replaces legacy monolith
- Handles $1M+ daily revenue
- Tier 0 criticality

**Evaluation:**

Run through checklist:

**Observability:**
- ✅ Structured logs with request IDs
- ✅ Metrics (latency, error rate, revenue)
- ❌ No distributed tracing (BLOCKER for tier 0)
- ✅ Alerts configured
- ⚠️ Alert thresholds guessed, not tested

**Safety:**
- ✅ Timeouts on all external calls
- ❌ No circuit breaker for Stripe API (BLOCKER)
- ✅ Retries with exponential backoff
- ✅ Rate limiting per user

**Runbooks:**
- ❌ No runbooks (BLOCKER)
- ⚠️ Rollback procedure not tested

**Data:**
- ✅ Automated daily backups
- ⚠️ Backup restoration not tested
- ✅ Audit logs for all payments
- ✅ Zero-downtime migrations

**Security:**
- ✅ Secrets in AWS Secrets Manager
- ✅ PII encrypted and redacted
- ✅ Authentication + authorization
- ✅ TLS everywhere

**Capacity:**
- ⚠️ Not load tested (BLOCKER for tier 0)
- ✅ Autoscaling configured
- ✅ Connection pooling

**Incident Response:**
- ✅ PagerDuty alerts
- ✅ On-call rotation
- ✅ Status page integration

**Summary:**
- **Status:** NOT READY (4 blockers)
- **Blockers:**
  1. No distributed tracing
  2. No circuit breaker for Stripe
  3. No runbooks
  4. Not load tested
- **ETA:** 2 weeks

### Example 2: Internal Analytics Dashboard

**Context:**
- Internal-only dashboard
- Non-critical (tier 2)
- 10 users

**Evaluation:**

**Observability:**
- ⚠️ Basic logging (console.log)
- ⚠️ No metrics
- ⏭️ Tracing not needed (low traffic)
- ⏭️ No alerts needed (internal tool)

**Safety:**
- ⚠️ No timeouts (should add)
- ⏭️ Circuit breakers not needed (tier 2)
- ⏭️ Rate limiting not needed (internal)

**Runbooks:**
- ⏭️ Not needed (tier 2)

**Data:**
- ⏭️ Analytics data is ephemeral
- ⏭️ No backups needed

**Security:**
- ✅ Internal auth (SSO)
- ✅ No PII

**Capacity:**
- ✅ Handles 10 users easily
- ⏭️ Load testing not needed

**Incident Response:**
- ⏭️ No on-call (internal tool)

**Summary:**
- **Status:** READY (tier 2 requirements)
- **Recommendations:**
  1. Add structured logging
  2. Add basic metrics
  3. Add timeouts to external calls

### Example 3: User Authentication Service

**Context:**
- Handles login/signup
- Tier 0 (blocks all features if down)
- 100K daily active users

**Evaluation:**

**Observability:**
- ✅ Structured logs with correlation IDs
- ✅ Distributed tracing (Jaeger)
- ✅ Golden signals + auth-specific metrics
- ✅ Alerts on high error rate, slow logins
- ✅ Alert thresholds tested via load test

**Safety:**
- ✅ Timeouts on database, email service
- ✅ Circuit breaker for email service
- ✅ Retries with exponential backoff
- ✅ Rate limiting (100 login attempts/hour)
- ✅ Account lockout after 5 failed attempts

**Runbooks:**
- ✅ Runbook for "high login errors"
- ✅ Runbook for "database connection pool"
- ✅ Runbook for "email service down"
- ✅ Rollback tested quarterly

**Data:**
- ✅ Hourly backups
- ✅ Backup restoration tested monthly
- ✅ Audit logs for all auth events
- ✅ Zero-downtime migrations
- ⚠️ Backup retention 30 days (should be 90)

**Security:**
- ✅ Secrets in Vault
- ✅ Passwords hashed (bcrypt)
- ✅ PII encrypted at rest
- ✅ TLS 1.3
- ✅ Rate limiting on auth endpoints
- ✅ CSRF protection
- ✅ No secrets in logs

**Capacity:**
- ✅ Load tested to 1M requests/hour
- ✅ Autoscaling (3-50 pods)
- ✅ Database read replicas
- ✅ Connection pooling

**Incident Response:**
- ✅ 24/7 on-call
- ✅ SEV-0 escalation policy
- ✅ Status page integration
- ✅ Post-mortem process

**Summary:**
- **Status:** READY
- **Minor improvements:**
  1. Extend backup retention to 90 days (compliance)
- **Score:** 68/70 (97%)

## Production Readiness Philosophy

**Production-ready means:**
- ✅ You can **debug incidents** without SSH
- ✅ Failures **don't cascade**
- ✅ You can **restore from disasters**
- ✅ You can **handle 10x traffic**
- ✅ You can **fix incidents at 2am**
- ✅ Secrets **stay secret**
- ✅ User data **stays safe**

**Not production-ready means:**
- ❌ "It works on my machine"
- ❌ "We'll add monitoring later"
- ❌ "We'll write runbooks after the first incident"
- ❌ "We haven't tested rollback"
- ❌ "I'm not sure what happens at scale"

**The 2am test:**
If you wouldn't want to be woken up at 2am to debug this service, it's not production-ready.
