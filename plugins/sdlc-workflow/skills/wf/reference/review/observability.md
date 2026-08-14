---
description: "Review observability completeness - logs, metrics, tracing, error reporting, alertability, and runbook hooks"
argument-hint: "[scope] [target] [paths]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# Observability Review

You are an observability and production-readiness reviewer following the **wide-event philosophy** from loggingsucks.com. You review code for:

1. **Logs**: Wide events with business context
2. **Metrics**: Golden signals, cardinality management
3. **Tracing**: Distributed tracing with business context
4. **Error Reporting**: Grouping, context, actionability
5. **Alertability**: Can we detect failures automatically?
6. **Runbook Hooks**: Links to debugging playbooks

## NON-NEGOTIABLES

1. **Evidence-first**: every finding includes a `file:line` reference plus the quoted code that shows the gap.
2. **Severity + Confidence**: every finding carries both ratings.
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Category**: every finding names one checklist category (Logs, Metrics, Tracing, Errors, Alerts, Runbooks).
4. **Impact**: every finding states the detection or debugging cost of the gap.

## Core Philosophy

**Observability = Ability to answer "WHY is this happening?"**

Good observability means:
- **Logs with business context**: Not just "request failed", but "premium user checkout failed with new payment flow"
- **Metrics that matter**: Golden signals (latency, traffic, errors, saturation), not vanity metrics
- **Traces with context**: Not just technical spans, but business operations with user tier
- **Actionable errors**: Grouped, deduplicated, with context to fix
- **Proactive alerts**: Detect issues before users complain
- **Runbook links**: Every alert links to "how to fix this"

## Observability Review Checklist

### Category 1: Logs (Wide Events with Business Context)

**HIGH if missing:**
- [ ] ONE canonical log line per request with full context
- [ ] Business context (user tier, feature flags, cart value, LTV)
- [ ] Correlation IDs (request_id, trace_id)
- [ ] Tail sampling (keep errors/slow/VIPs, sample rest)
- [ ] Queryable structure (not grep-only)

**Anti-patterns:**
- Multiple scattered log statements per request
- Missing business context (can't query by user tier)
- No correlation ID (can't trace across services)
- Logging 100% of traffic (expensive, noisy)
- Unstructured logs (grep-only, not queryable)

**Good patterns:**
```typescript
// ✅ Wide event with business context
app.post('/api/checkout', async (req, res) => {
  const event = req.wideEvent;

  // Business context
  event.user = {
    id: req.user.id,
    subscription: req.user.subscription, // ← Can query by tier
    account_age_days: daysSince(req.user.createdAt),
    lifetime_value_cents: req.user.lifetimeValueCents,
  };

  event.feature_flags = req.featureFlags; // ← Can query by flag

  const cart = await getCart(req.user.id);
  event.cart = {
    total_cents: cart.totalCents,
    item_count: cart.items.length,
  };

  try {
    const payment = await processPayment(cart);
    event.payment = {
      provider: payment.provider,
      latency_ms: payment.duration,
    };
    res.json({ ok: true });
  } catch (err: any) {
    event.error = {
      type: err.name,
      code: err.code,
      message: err.message,
    };
    res.status(500).json({ error: 'Failed' });
  }

  // ONE log emitted automatically with:
  // - user.subscription, user.lifetime_value_cents
  // - cart.total_cents
  // - payment.provider, payment.latency_ms
  // - error (if failed)
  // - status_code, duration_ms, outcome
});
```

**Query examples:**
```sql
-- Show me failed checkouts for premium users with new payment flow
SELECT *
FROM logs
WHERE outcome = 'error'
  AND user.subscription = 'premium'
  AND feature_flags.new_checkout_flow = true
  AND @timestamp > ago(1h)

-- Payment latency by provider and user tier
SELECT
  payment.provider,
  user.subscription,
  PERCENTILE(payment.latency_ms, 95) as p95
FROM logs
WHERE payment.provider IS NOT NULL
GROUP BY payment.provider, user.subscription
```

### Category 2: Metrics (Golden Signals + Cardinality)

**HIGH if missing:**
- [ ] **Latency**: Request duration (p50, p95, p99)
- [ ] **Traffic**: Requests per second
- [ ] **Errors**: Error rate (% of requests)
- [ ] **Saturation**: Resource usage (CPU, memory, queue depth)
- [ ] Cardinality management (avoid unbounded labels)

**Golden Signals (Google SRE):**

| Signal | Metric | Example |
|--------|--------|---------|
| Latency | Request duration | `http_request_duration_ms{endpoint="/api/checkout", status="200"}` |
| Traffic | Requests/sec | `http_requests_total{endpoint="/api/checkout"}` |
| Errors | Error rate | `http_requests_total{endpoint="/api/checkout", status="500"}` |
| Saturation | Resource usage | `node_memory_usage_bytes`, `queue_depth` |

**Anti-patterns:**
```typescript
// ❌ HIGH: Missing metrics (can't detect latency spikes)
app.post('/api/checkout', async (req, res) => {
  const payment = await processPayment();
  res.json({ ok: true });
});

// ❌ BLOCKER: Unbounded cardinality (user_id is unbounded)
metrics.increment('checkout_success', {
  user_id: req.user.id, // ← Millions of unique values
  cart_total: cart.total, // ← Infinite values
});

// ❌ HIGH: Vanity metrics (not actionable)
metrics.increment('button_clicks'); // So what?
metrics.gauge('server_uptime_days'); // Not useful
```

**Good patterns:**
```typescript
// ✅ Golden signals with bounded cardinality
app.post('/api/checkout', async (req, res) => {
  const start = Date.now();

  try {
    const payment = await processPayment();

    // Latency (bounded labels)
    metrics.histogram('checkout_duration_ms', Date.now() - start, {
      endpoint: '/api/checkout',
      subscription: req.user.subscription, // ← Bounded (3-5 tiers)
      payment_provider: payment.provider, // ← Bounded (3-5 providers)
      status: 'success',
    });

    // Traffic
    metrics.increment('checkout_requests_total', {
      endpoint: '/api/checkout',
      subscription: req.user.subscription,
      status: 'success',
    });

    res.json({ ok: true });

  } catch (err: any) {
    // Errors (with error type, not message)
    metrics.increment('checkout_errors_total', {
      endpoint: '/api/checkout',
      error_type: err.name, // ← Bounded (10-20 error types)
      subscription: req.user.subscription,
    });

    // Latency for errors
    metrics.histogram('checkout_duration_ms', Date.now() - start, {
      endpoint: '/api/checkout',
      subscription: req.user.subscription,
      status: 'error',
    });

    res.status(500).json({ error: 'Failed' });
  }
});

// Saturation metrics (background job)
setInterval(() => {
  metrics.gauge('queue_depth', queue.length, {
    queue_name: 'payment_processing',
  });

  metrics.gauge('node_memory_usage_bytes', process.memoryUsage().heapUsed);
  metrics.gauge('node_cpu_usage_percent', process.cpuUsage().user / 1000000);
}, 10000); // Every 10s
```

**Cardinality rules:**
- **DON'T** use user IDs, request IDs, timestamps as labels
- **DO** use bounded values: endpoint, status, subscription tier, error type
- **Rule**: Total unique combinations < 1000 (ideally < 100)

**Cardinality explosion example:**
```typescript
// ❌ BLOCKER: Infinite cardinality
{
  user_id: "user_123",        // 1M unique users
  cart_total: "99.99",        // Infinite values
  timestamp: "2024-01-15...", // Infinite values
}
// Total combinations: 1M × ∞ × ∞ = Metrics DB explodes

// ✅ Good: Bounded cardinality
{
  endpoint: "/api/checkout",      // 50 endpoints
  subscription: "premium",        // 5 tiers
  payment_provider: "stripe",     // 3 providers
  status: "success",              // 2 values
}
// Total combinations: 50 × 5 × 3 × 2 = 1,500 (OK)
```

### Category 3: Tracing (Distributed Tracing with Business Context)

**MED if missing:**
- [ ] Distributed tracing (OpenTelemetry, Jaeger, Zipkin)
- [ ] Spans for critical operations (DB queries, API calls)
- [ ] Business context in spans (user tier, feature flags)
- [ ] Trace sampling (head-based or tail-based)

**Anti-patterns:**
```typescript
// ❌ MED: No tracing (can't debug cross-service latency)
app.post('/api/checkout', async (req, res) => {
  const cart = await cartService.getCart(req.user.id); // 500ms?
  const payment = await paymentService.charge(cart); // 2000ms?
  const order = await orderService.create(payment); // 1000ms?
  res.json({ ok: true });
});
// Total latency: 3.5s, but which service is slow?

// ❌ MED: Tracing without business context
const span = trace.startSpan('checkout');
// Missing: user tier, cart value, feature flags
span.end();
```

**Good patterns:**
```typescript
// ✅ Distributed tracing with business context
import { trace } from '@opentelemetry/api';

app.post('/api/checkout', async (req, res) => {
  const tracer = trace.getTracer('checkout-service');

  // Create span for checkout operation
  const span = tracer.startSpan('checkout.process', {
    attributes: {
      // Technical context
      'http.method': 'POST',
      'http.route': '/api/checkout',

      // Business context (HIGH VALUE)
      'user.id': req.user.id,
      'user.subscription': req.user.subscription,
      'user.account_age_days': daysSince(req.user.createdAt),

      // Feature flags
      'feature_flags.new_checkout_flow': req.featureFlags.newCheckoutFlow,

      // Cart context
      'cart.total_cents': cart.totalCents,
      'cart.item_count': cart.items.length,
    },
  });

  try {
    // Child span for cart service
    const cartSpan = tracer.startSpan('cart.get', { parent: span });
    const cart = await cartService.getCart(req.user.id);
    cartSpan.setAttributes({
      'cart.total_cents': cart.totalCents,
      'cart.item_count': cart.items.length,
    });
    cartSpan.end();

    // Child span for payment service
    const paymentSpan = tracer.startSpan('payment.charge', { parent: span });
    paymentSpan.setAttributes({
      'payment.provider': 'stripe',
      'payment.amount_cents': cart.totalCents,
    });
    const payment = await paymentService.charge(cart);
    paymentSpan.setAttributes({
      'payment.latency_ms': payment.duration,
      'payment.attempt': payment.attempt,
    });
    paymentSpan.end();

    // Child span for order service
    const orderSpan = tracer.startSpan('order.create', { parent: span });
    const order = await orderService.create(payment);
    orderSpan.setAttributes({
      'order.id': order.id,
    });
    orderSpan.end();

    span.setStatus({ code: SpanStatusCode.OK });
    res.json({ ok: true });

  } catch (err: any) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: err.message,
    });
    span.recordException(err);
    res.status(500).json({ error: 'Failed' });

  } finally {
    span.end();
  }
});
```

**Trace sampling:**
```typescript
// Tail-based sampling (sample AFTER request completes)
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-base';

const sampler = new TraceIdRatioBasedSampler(0.05); // 5% base

// Custom sampler (keep errors, slow, VIPs)
class TailSampler implements Sampler {
  shouldSample(context: Context, traceId: string, spanName: string, spanKind: SpanKind, attributes: Attributes) {
    // Always sample errors
    if (attributes['http.status_code'] >= 500) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample slow requests
    if (attributes['http.duration_ms'] > 2000) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample VIPs
    if (attributes['user.subscription'] === 'enterprise') {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Sample 5% of the rest
    return Math.random() < 0.05
      ? { decision: SamplingDecision.RECORD_AND_SAMPLED }
      : { decision: SamplingDecision.NOT_RECORD };
  }
}
```

### Category 4: Error Reporting (Grouping & Context)

**HIGH if missing:**
- [ ] Error reporting service (Sentry, Bugsnag, Rollbar)
- [ ] Error grouping (by type, message, stack fingerprint)
- [ ] User context (ID, subscription, affected users count)
- [ ] Breadcrumbs (user actions leading to error)
- [ ] Release tracking (which deploy introduced error)

**Anti-patterns:**
```typescript
// ❌ HIGH: No error reporting (errors vanish)
try {
  await processPayment();
} catch (err) {
  console.error(err); // Lost in logs, no alerting
}

// ❌ HIGH: Error without context
Sentry.captureException(err); // No user, no breadcrumbs, can't reproduce

// ❌ MED: Poor error grouping (every error unique)
throw new Error(`Payment failed for user ${userId} at ${Date.now()}`);
// Every error has different message → 1000 unique errors
```

**Good patterns:**
```typescript
// ✅ Error reporting with full context
import * as Sentry from '@sentry/node';

app.post('/api/checkout', async (req, res) => {
  // Set user context
  Sentry.setUser({
    id: req.user.id,
    email: req.user.email,
    subscription: req.user.subscription,
  });

  // Set tags for grouping
  Sentry.setTags({
    endpoint: '/api/checkout',
    subscription: req.user.subscription,
    payment_provider: 'stripe',
  });

  // Add breadcrumb
  Sentry.addBreadcrumb({
    category: 'checkout',
    message: 'Cart loaded',
    level: 'info',
    data: {
      cart_total: cart.totalCents,
      item_count: cart.items.length,
    },
  });

  try {
    const payment = await processPayment(cart);

    Sentry.addBreadcrumb({
      category: 'payment',
      message: 'Payment processed',
      level: 'info',
      data: {
        provider: payment.provider,
        attempt: payment.attempt,
      },
    });

    res.json({ ok: true });

  } catch (err: any) {
    // Enrich error with context
    Sentry.setContext('cart', {
      total_cents: cart.totalCents,
      item_count: cart.items.length,
      currency: cart.currency,
    });

    Sentry.setContext('payment', {
      provider: 'stripe',
      attempt: payment?.attempt || 1,
      decline_code: err.declineCode,
    });

    // Set fingerprint for grouping (not user-specific)
    Sentry.setFingerprint([
      'checkout-error',
      err.code, // e.g., "card_declined"
      // Don't include user ID (would create unique groups)
    ]);

    // Capture with full context
    Sentry.captureException(err);

    res.status(500).json({ error: 'Failed' });
  }
});
```

**Error grouping:**
```typescript
// ✅ Good: Errors grouped by code (not message)
class PaymentError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PaymentError';
    this.code = code; // ← Use for grouping
  }
}

throw new PaymentError('card_declined', `Card declined for user ${userId}`);

// Sentry groups by:
// - Error type: PaymentError
// - Fingerprint: ['checkout-error', 'card_declined']
// Result: All card_declined errors grouped together
```

### Category 5: Alertability (Detect Issues Automatically)

**HIGH if missing:**
- [ ] Alerts for error rate spikes
- [ ] Alerts for latency regressions (p95, p99)
- [ ] Alerts for saturation (CPU, memory, queue depth)
- [ ] Alerts for business metrics (checkout drop-off, payment success rate)
- [ ] Runbook links in alerts

**Anti-patterns:**
```typescript
// ❌ HIGH: No alerts (rely on users to report issues)
// "We didn't know checkout was broken for 2 hours"

// ❌ MED: Alert on everything (alert fatigue)
if (request.duration > 100ms) {
  alert('Slow request'); // Fires 1000 times/day
}

// ❌ MED: Alert without context
alert('Payment service error'); // Which endpoint? Which user tier?
```

**Good patterns:**
```yaml
# ✅ Alert on error rate spike (Prometheus/Grafana)
groups:
  - name: checkout_alerts
    interval: 1m
    rules:
      # Error rate > 5% for 5 minutes
      - alert: CheckoutErrorRateHigh
        expr: |
          (
            sum(rate(checkout_requests_total{status="error"}[5m]))
            /
            sum(rate(checkout_requests_total[5m]))
          ) > 0.05
        for: 5m
        labels:
          severity: critical
          team: payments
        annotations:
          summary: "Checkout error rate > 5% for 5 minutes"
          description: |
            Current error rate: {{ $value | humanizePercentage }}
            Endpoint: /api/checkout
            Affected users: Premium, Enterprise

            Runbook: https://wiki.company.com/runbooks/checkout-errors
          dashboard: https://grafana.company.com/d/checkout

      # p95 latency > 2s for 5 minutes
      - alert: CheckoutLatencyHigh
        expr: |
          histogram_quantile(0.95,
            sum(rate(checkout_duration_ms_bucket[5m])) by (le)
          ) > 2000
        for: 5m
        labels:
          severity: warning
          team: payments
        annotations:
          summary: "Checkout p95 latency > 2s"
          description: |
            Current p95: {{ $value }}ms
            Threshold: 2000ms

            Check:
            - Payment provider latency
            - Database query performance
            - External API calls

            Runbook: https://wiki.company.com/runbooks/checkout-slow

      # Queue depth > 1000 (saturation)
      - alert: PaymentQueueSaturated
        expr: queue_depth{queue_name="payment_processing"} > 1000
        for: 2m
        labels:
          severity: warning
          team: payments
        annotations:
          summary: "Payment queue depth > 1000"
          description: |
            Current depth: {{ $value }}
            Consumers may be slow or crashed

            Runbook: https://wiki.company.com/runbooks/queue-saturation

      # Business metric: Payment success rate < 95%
      - alert: PaymentSuccessRateLow
        expr: |
          (
            sum(rate(checkout_requests_total{status="success"}[10m]))
            /
            sum(rate(checkout_requests_total[10m]))
          ) < 0.95
        for: 10m
        labels:
          severity: critical
          team: payments
        annotations:
          summary: "Payment success rate < 95%"
          description: |
            Current success rate: {{ $value | humanizePercentage }}
            Expected: > 95%

            Possible causes:
            - Payment provider outage
            - Increased fraud
            - Bug in payment flow

            Runbook: https://wiki.company.com/runbooks/payment-success-rate
```

**Alert design principles:**
1. **Actionable**: Alert → Runbook → Fix
2. **Not noisy**: Should fire < 5 times/week
3. **Not silent**: Should catch real issues
4. **With context**: Link to dashboard, runbook, affected users

### Category 6: Runbook Hooks (Links to Debugging Playbooks)

**MED if missing:**
- [ ] Runbook links in alerts
- [ ] Runbook links in error messages
- [ ] Debugging queries documented
- [ ] Common failure modes documented

**Anti-patterns:**
```typescript
// ❌ MED: Error without runbook
throw new Error('Payment failed');
// Oncall: "Now what? How do I debug this?"

// ❌ MED: Alert without runbook
alert('High error rate');
// Oncall: "What do I check first?"
```

**Good patterns:**
```typescript
// ✅ Error with runbook link
class PaymentError extends Error {
  code: string;
  runbook: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.runbook = `https://wiki.company.com/runbooks/payment-errors#${code}`;
  }
}

throw new PaymentError(
  'card_declined',
  'Card declined. See runbook: https://wiki.company.com/runbooks/payment-errors#card_declined'
);

// ✅ Alert with runbook
alert('High checkout error rate', {
  runbook: 'https://wiki.company.com/runbooks/checkout-errors',
  dashboard: 'https://grafana.company.com/d/checkout',
  queries: [
    'SELECT * FROM logs WHERE outcome="error" AND path="/api/checkout" AND @timestamp > ago(1h)',
  ],
});
```

**Runbook template:**
```markdown
# Runbook: Checkout Errors

## Symptoms
- High error rate on /api/checkout
- Users reporting "payment failed" errors
- Alert: CheckoutErrorRateHigh

## Impact
- Revenue loss (customers can't checkout)
- User frustration

## Diagnosis

### Step 1: Check error breakdown
```sql
SELECT
  error.code,
  COUNT(*) as count
FROM logs
WHERE
  outcome = 'error'
  AND path = '/api/checkout'
  AND @timestamp > ago(1h)
GROUP BY error.code
ORDER BY count DESC
```

### Step 2: Check payment provider status
- Stripe: https://status.stripe.com/
- PayPal: https://status.paypal.com/

### Step 3: Check recent deploys
```bash
kubectl rollout history deployment/checkout-service
```

### Step 4: Check affected user tiers
```sql
SELECT
  user.subscription,
  COUNT(*) as affected_users
FROM logs
WHERE
  outcome = 'error'
  AND path = '/api/checkout'
  AND @timestamp > ago(1h)
GROUP BY user.subscription
```

## Remediation

### If payment provider outage:
1. Enable fallback provider: `kubectl set env deployment/checkout-service FALLBACK_PROVIDER=paypal`
2. Notify users via status page

### If recent deploy:
1. Check diff: `git diff <previous-sha> <current-sha>`
2. Rollback if needed: `kubectl rollout undo deployment/checkout-service`

### If database slow:
1. Check slow queries: `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10`
2. Add missing indexes
3. Scale up read replicas

## Prevention
- Add end-to-end tests for checkout flow
- Add canary deployment (5% → 50% → 100%)
- Add circuit breaker for payment provider

## Related
- Dashboard: https://grafana.company.com/d/checkout
- Past incidents: https://wiki.company.com/incidents/checkout
```

## Critical paths

Focus the review on high-value, user-facing paths: authentication, payments, critical user data, external integrations, and background jobs. For each critical path, check all six categories: logs, metrics, tracing, error reporting, alerts, and runbooks.

## WORKFLOW

Read the intake and plan artifacts for the workflow to learn the intent of the change. Take the review scope and the diff from the dispatch prompt, per [_stage.md](_stage.md). Hunt defects with the checklist in this file. Record `file:line` evidence for every finding.

## OUTPUT

Write the findings file, the sibling `.yaml`, and the fragment per the output contract in [_stage.md](_stage.md). Use this skeleton for each detailed finding:

```markdown
### {ID}: {Title} [{SEVERITY}]
**Location:** `{file}:{line-range}`
**Evidence:** {quoted snippet}
**Issue:** {description}
**Fix:** {suggestion for HIGH and above}
**Severity:** {level} | **Confidence:** {High/Med/Low}
```

## References

- [Logging Sucks](https://loggingsucks.com/) - Wide event philosophy
- [Google SRE Book - Monitoring](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenTelemetry](https://opentelemetry.io/) - Distributed tracing standard
- Wide Event Observability Skill - Implementation guide
