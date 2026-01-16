# Observability Guide

Complete guide to implementing world-class observability using the session-workflow plugin's wide-event philosophy.

---

## Table of Contents

- [Philosophy: Wide-Event Observability](#philosophy-wide-event-observability)
- [The Problem with Traditional Logging](#the-problem-with-traditional-logging)
- [The Wide-Event Solution](#the-wide-event-solution)
- [Tail Sampling Explained](#tail-sampling-explained)
- [Implementation Guide](#implementation-guide)
- [Business Context: The Secret Sauce](#business-context-the-secret-sauce)
- [Cost Analysis](#cost-analysis)
- [Migration Strategy](#migration-strategy)
- [Monitoring & Alerting](#monitoring--alerting)
- [Real-World Examples](#real-world-examples)

---

## Philosophy: Wide-Event Observability

**Core Principle**: Log ONE comprehensive event per request per service, not scattered breadcrumbs.

### Traditional Logging (❌ Don't do this)

```typescript
// Scattered logs throughout request lifecycle
logger.info('Checkout started', { userId: req.user.id });
logger.info('Cart validated', { itemCount: cart.items.length });
logger.info('Payment processing', { provider: 'stripe' });
logger.info('Inventory reserved', { items: cart.items.map(i => i.id) });
logger.info('Order created', { orderId: order.id });
logger.info('Email queued', { type: 'order-confirmation' });
logger.info('Checkout complete', { duration: Date.now() - start });

// Problems:
// 1. 7 separate log entries (high volume, high cost)
// 2. Hard to correlate (need request_id grep)
// 3. Missing business context (user tier, cart value, LTV)
// 4. Can't query efficiently (grep is slow)
// 5. 100% sampling = expensive
```

### Wide-Event Logging (✅ Do this instead)

```typescript
// ONE comprehensive event with all context
const wideEvent: WideEvent = {
  // Correlation
  timestamp: new Date().toISOString(),
  request_id: req.id,
  trace_id: req.headers['x-trace-id'],

  // Service Context
  service: 'checkout-api',
  version: '2.5.0',
  deployment_id: process.env.DEPLOYMENT_ID,

  // Request Details
  method: 'POST',
  path: '/api/checkout',
  status_code: 200,
  duration_ms: 245,

  // Business Context (HIGH VALUE)
  user: {
    id: req.user.id,
    subscription: req.user.subscription,  // 'free' | 'premium' | 'enterprise'
    lifetime_value_cents: req.user.ltv,
    signup_date: req.user.signupDate
  },

  cart: {
    total_cents: cart.total,
    item_count: cart.items.length,
    has_coupon: Boolean(cart.coupon)
  },

  // Feature Flags
  feature_flags: {
    new_checkout_flow: true,
    payment_api_v2: true
  },

  // Execution Details
  payment: {
    provider: 'stripe',
    method: 'card',
    authorization_time_ms: 180
  },

  inventory: {
    reserved_items: cart.items.length,
    reservation_time_ms: 45
  },

  // Outcome
  outcome: 'success',
  order_id: order.id
};

// Tail sampling: Only log if signal
if (shouldSample(wideEvent)) {
  logger.info(wideEvent, 'checkout_complete');
}

// Benefits:
// 1. ONE log entry (10x lower volume)
// 2. Complete context (no grep needed)
// 3. Rich business context (query by user tier, cart value)
// 4. SQL queryable (CloudWatch Insights, Datadog)
// 5. Tail sampling (90% cost reduction)
```

---

## The Problem with Traditional Logging

### Problem 1: Optimized for Writing, Not Querying

**Traditional approach**:
```bash
# How you write logs (easy)
logger.info('Payment processed');

# How you query logs (painful)
grep "Payment processed" logs/*.log |
  grep "user_id=12345" |
  awk '{print $3}' |
  sort |
  uniq -c
```

**Why this is broken**:
- Grep is slow (scans every line)
- Hard to correlate across services
- No aggregations (can't do SUM, AVG, COUNT)
- Complex queries require awk/sed wizardry

### Problem 2: High Volume, Low Signal

**Typical API request generates**:
- 5-10 debug logs
- 2-3 info logs
- 0-1 error logs (hopefully 0)

**Result**:
- 99% of logs are noise (successful requests)
- 1% of logs are signal (errors, slow requests)
- Pay for 100% of logs (expensive)

### Problem 3: Missing Business Context

**Traditional log**:
```json
{
  "timestamp": "2025-01-15T14:30:00Z",
  "level": "info",
  "message": "Checkout completed",
  "request_id": "abc123",
  "duration_ms": 245
}
```

**Questions you CAN'T answer**:
- What's the checkout success rate for premium users?
- What's the average cart value for slow checkouts?
- Do users with coupons have higher failure rates?
- What's the LTV of users affected by this bug?

**Why**: No business context in logs.

---

## The Wide-Event Solution

### One Event Per Request

```typescript
interface WideEvent {
  // Correlation (connect logs/traces/metrics)
  timestamp: string;
  request_id: string;
  trace_id?: string;
  parent_request_id?: string;  // For service-to-service calls

  // Service Context
  service: string;
  version: string;
  deployment_id: string;
  host: string;

  // Request Details
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;

  // Business Context (THE SECRET SAUCE)
  user: {
    id: string;
    subscription: 'free' | 'premium' | 'enterprise';
    lifetime_value_cents: number;
    signup_date: string;
    country: string;
  };

  // Request-Specific Context (varies by endpoint)
  cart?: {
    total_cents: number;
    item_count: number;
    has_coupon: boolean;
    coupon_code?: string;
  };

  search?: {
    query: string;
    result_count: number;
    filters_applied: string[];
  };

  // Feature Flags (critical for rollouts)
  feature_flags: Record<string, boolean>;

  // Error Details (if error occurred)
  error?: {
    type: string;
    code: string;
    message: string;
    retriable: boolean;
    stack_trace?: string;
  };

  // Performance Breakdown
  timings?: {
    database_ms: number;
    external_api_ms: number;
    cache_ms: number;
    business_logic_ms: number;
  };

  // Outcome
  outcome: 'success' | 'error' | 'timeout' | 'cancelled';
}
```

### Benefits

1. **Complete Context**: Everything in one place
2. **Correlatable**: request_id + trace_id connect all logs
3. **Queryable**: SQL queries instead of grep
4. **Business-Aware**: Every log has user tier, LTV, cart value
5. **Cost-Effective**: Tail sampling keeps signal, discards noise

---

## Tail Sampling Explained

### What is Tail Sampling?

**Keep 100% of signal** (errors, slow, VIPs, flagged requests)
**Sample 5% of noise** (normal successful requests)

**Result**: 90% cost reduction, 100% signal retention

### Sampling Decision Function

```typescript
function shouldSample(event: WideEvent): boolean {
  // ALWAYS keep errors (signal)
  if (event.status_code >= 500) {
    return true;  // Keep all server errors
  }

  if (event.status_code >= 400) {
    return true;  // Keep all client errors
  }

  // ALWAYS keep slow requests (signal)
  if (event.duration_ms > 2000) {
    return true;  // Keep requests slower than 2s
  }

  // ALWAYS keep VIP users (signal)
  if (event.user?.subscription === 'enterprise') {
    return true;  // Keep all enterprise user requests
  }

  if (event.user?.lifetime_value_cents > 100000) {
    return true;  // Keep high-LTV users ($1000+)
  }

  // ALWAYS keep flagged traffic (signal for rollouts)
  if (event.feature_flags?.new_checkout_flow) {
    return true;  // Keep all requests using new feature
  }

  // ALWAYS keep high-value transactions (signal)
  if (event.cart?.total_cents > 10000) {
    return true;  // Keep purchases > $100
  }

  // Sample 5% of everything else (noise)
  return Math.random() < 0.05;
}
```

### Why This Works

**Typical traffic breakdown**:
- 98% successful requests (noise)
- 1% errors (signal)
- 0.5% slow requests (signal)
- 0.5% VIPs/flagged (signal)

**Sampling result**:
- Keep 100% of errors (1% = 10,000 logs)
- Keep 100% of slow (0.5% = 5,000 logs)
- Keep 100% of VIPs (0.5% = 5,000 logs)
- Sample 5% of normal (98% × 0.05 = 4.9% = 49,000 logs)
- **Total: 69,000 logs instead of 1,000,000 logs (93% reduction)**

### What You DON'T Lose

- ❌ "But I need to see all successful requests!"
  - ✅ You can see all INTERESTING successful requests (VIPs, high-value, flagged)
  - ✅ You can see 5% sample for volume estimation

- ❌ "But I need to calculate exact success rate!"
  - ✅ Use metrics for exact rates (counters are cheap)
  - ✅ Use logs for diagnosis (logs are expensive)

- ❌ "But I need to debug individual user issues!"
  - ✅ If it's an error, you have the log (100% kept)
  - ✅ If it's VIP, you have the log (100% kept)
  - ✅ If it's normal user with no error, why are you debugging it?

---

## Implementation Guide

### Step 1: Define Your Wide Event Schema

```typescript
// src/lib/observability/types.ts

export interface WideEvent {
  // Correlation
  timestamp: string;
  request_id: string;
  trace_id?: string;

  // Service
  service: string;
  version: string;
  deployment_id: string;

  // Request
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;

  // Business Context (customize for your domain)
  user?: {
    id: string;
    subscription: 'free' | 'premium' | 'enterprise';
    lifetime_value_cents: number;
  };

  // Feature Flags
  feature_flags: Record<string, boolean>;

  // Error
  error?: {
    type: string;
    message: string;
    retriable: boolean;
  };

  // Outcome
  outcome: 'success' | 'error';
}
```

### Step 2: Create Tail Sampling Function

```typescript
// src/lib/observability/sampling.ts

export function shouldSample(event: WideEvent): boolean {
  // Always keep errors
  if (event.status_code >= 400) return true;

  // Always keep slow
  if (event.duration_ms > 2000) return true;

  // Always keep VIPs
  if (event.user?.subscription === 'enterprise') return true;

  // Always keep flagged traffic
  if (Object.values(event.feature_flags).some(v => v)) return true;

  // Sample 5% of rest
  return Math.random() < 0.05;
}
```

### Step 3: Create Middleware (Express Example)

```typescript
// src/lib/observability/middleware.ts

import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { WideEvent, shouldSample } from './types';

const logger = pino();

export function wideEventMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const request_id = req.id || generateRequestId();

    // Attach wide event to request (enrich throughout handler)
    const wideEvent: WideEvent = {
      timestamp: new Date().toISOString(),
      request_id,
      trace_id: req.headers['x-trace-id'] as string,
      service: 'api',
      version: process.env.npm_package_version || 'unknown',
      deployment_id: process.env.DEPLOYMENT_ID || 'unknown',
      method: req.method,
      path: req.path,
      status_code: 0,  // Will be set on finish
      duration_ms: 0,
      feature_flags: {},
      outcome: 'success'
    };

    (req as any).wideEvent = wideEvent;
    res.setHeader('x-request-id', request_id);

    // Log on response finish
    res.on('finish', () => {
      wideEvent.status_code = res.statusCode;
      wideEvent.duration_ms = Date.now() - start;
      wideEvent.outcome = res.statusCode >= 500 ? 'error' : 'success';

      // Tail sampling
      if (shouldSample(wideEvent)) {
        logger.info(wideEvent, 'request_complete');
      }
    });

    next();
  };
}

function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

### Step 4: Enrich with Business Context

```typescript
// src/routes/checkout.ts

app.post('/api/checkout', async (req, res) => {
  const wideEvent = (req as any).wideEvent as WideEvent;

  try {
    // Enrich with user context
    wideEvent.user = {
      id: req.user.id,
      subscription: req.user.subscription,
      lifetime_value_cents: req.user.ltv
    };

    // Enrich with cart context
    wideEvent.cart = {
      total_cents: req.body.cart.total,
      item_count: req.body.cart.items.length,
      has_coupon: Boolean(req.body.cart.coupon)
    };

    // Enrich with feature flags
    wideEvent.feature_flags = {
      new_checkout_flow: req.features.isEnabled('new_checkout_flow'),
      payment_api_v2: req.features.isEnabled('payment_api_v2')
    };

    // Process checkout
    const order = await processCheckout(req.body.cart, req.user);

    // Enrich with outcome
    wideEvent.order_id = order.id;
    wideEvent.outcome = 'success';

    res.json({ success: true, order_id: order.id });

  } catch (error) {
    // Enrich with error context
    wideEvent.error = {
      type: error.constructor.name,
      message: error.message,
      retriable: error.retriable || false
    };
    wideEvent.outcome = 'error';

    res.status(500).json({ error: 'Checkout failed' });
  }
});
```

### Step 5: Query Your Logs (CloudWatch Insights Example)

```sql
-- Find slow checkouts for premium users
fields @timestamp, user.id, cart.total_cents, duration_ms
| filter path = '/api/checkout'
| filter user.subscription = 'premium'
| filter duration_ms > 1000
| sort duration_ms desc
| limit 20

-- Calculate average cart value by subscription tier
fields user.subscription, avg(cart.total_cents) as avg_cart_value
| filter path = '/api/checkout'
| filter outcome = 'success'
| stats avg_cart_value by user.subscription

-- Find error rate for new checkout flow
fields count(*) as total, sum(case when outcome = 'error' then 1 else 0 end) as errors
| filter feature_flags.new_checkout_flow = true
| stats sum(total) as total_requests, sum(errors) as error_count, (sum(errors) * 100.0 / sum(total)) as error_rate

-- Find high-value transactions that failed
fields @timestamp, user.id, cart.total_cents, error.message
| filter path = '/api/checkout'
| filter outcome = 'error'
| filter cart.total_cents > 10000
| sort cart.total_cents desc
| limit 20
```

---

## Business Context: The Secret Sauce

### Why Business Context Matters

**Without business context**:
```json
{
  "message": "Checkout completed",
  "duration_ms": 245,
  "status": 200
}
```

**Questions you CAN'T answer**:
- Is this a problem for our most valuable customers?
- Does this affect premium users more than free users?
- What's the revenue impact of this issue?

**With business context**:
```json
{
  "message": "Checkout completed",
  "duration_ms": 245,
  "status": 200,
  "user": {
    "subscription": "enterprise",
    "lifetime_value_cents": 250000
  },
  "cart": {
    "total_cents": 15000
  }
}
```

**Questions you CAN answer**:
- ✅ This affects enterprise users (highest priority)
- ✅ This customer has $2,500 LTV (very valuable)
- ✅ This transaction is $150 (high value)
- ✅ **ACTION**: Page oncall immediately

### What Business Context to Include

#### E-commerce

```typescript
{
  user: {
    id: string;
    subscription: 'free' | 'premium' | 'enterprise';
    lifetime_value_cents: number;
    signup_date: string;
    country: string;
  },
  cart: {
    total_cents: number;
    item_count: number;
    has_coupon: boolean;
    shipping_method: 'standard' | 'express';
  },
  order: {
    id: string;
    payment_method: 'card' | 'paypal' | 'applepay';
  }
}
```

#### SaaS

```typescript
{
  user: {
    id: string;
    org_id: string;
    plan: 'free' | 'starter' | 'business' | 'enterprise';
    mrr_cents: number;  // Monthly recurring revenue
    seat_count: number;
    contract_end_date: string;
  },
  api_request: {
    endpoint: string;
    quota_remaining: number;
    rate_limit_remaining: number;
  }
}
```

#### Marketplace

```typescript
{
  buyer: {
    id: string;
    trust_score: number;
    lifetime_purchases_cents: number;
  },
  seller: {
    id: string;
    rating: number;
    total_sales_cents: number;
  },
  listing: {
    id: string;
    category: string;
    price_cents: number;
  }
}
```

---

## Cost Analysis

### Before: Traditional Logging

**Traffic**: 1M requests/day
**Logs per request**: 7 (scattered logs)
**Total logs**: 7M logs/day
**Cost**: $0.50 per 1M logs (CloudWatch)
**Monthly cost**: **$105/month**

### After: Wide-Event Logging with Tail Sampling

**Traffic**: 1M requests/day
**Breakdown**:
- Errors (1%): 10,000 → Keep 100% = 10,000
- Slow (0.5%): 5,000 → Keep 100% = 5,000
- VIPs (0.5%): 5,000 → Keep 100% = 5,000
- Normal (98%): 980,000 → Sample 5% = 49,000

**Total logs**: 69,000 logs/day (vs 7M)
**Cost**: $0.50 per 1M logs
**Monthly cost**: **$1.04/month** (93% reduction)

**Savings**: $103.96/month per service

**For 20 services**: $2,079/month savings = **$25,000/year**

---

## Migration Strategy

### Phase 1: Parallel Implementation (Week 1-2)

Keep existing logs, add wide-event middleware:

```typescript
// Existing logs still work
logger.info('Checkout started');
logger.info('Payment processed');
logger.info('Checkout complete');

// New wide-event logs run in parallel
// (middleware logs one comprehensive event)
```

**Validate**:
- Wide events appearing in logs ✅
- All fields populated correctly ✅
- Tail sampling working ✅

### Phase 2: Query Validation (Week 3)

Test queries on wide events:

```sql
-- Can you answer business questions?
-- 1. Error rate by subscription tier?
-- 2. Average cart value for slow checkouts?
-- 3. Impact of feature flag on conversion?
```

**Validate**:
- All queries work ✅
- Results match expectations ✅
- Query performance acceptable ✅

### Phase 3: Remove Scattered Logs (Week 4)

Once validated, remove scattered logs:

```typescript
// ❌ Remove scattered logs
// logger.info('Checkout started');
// logger.info('Payment processed');
// logger.info('Checkout complete');

// ✅ Keep only wide-event logging
// (middleware handles everything)
```

**Monitor**:
- Log volume drops 90% ✅
- Cost drops 90% ✅
- No loss of visibility ✅

---

## Monitoring & Alerting

### Key Metrics to Alert On

```typescript
// Error rate by subscription tier
error_rate_enterprise = errors / total_requests WHERE user.subscription = 'enterprise'
// Alert if > 1% for enterprise users (high priority)

// P95 latency by endpoint
p95_latency_checkout = p95(duration_ms) WHERE path = '/api/checkout'
// Alert if > 2000ms

// High-value transaction failures
high_value_errors = count(*) WHERE outcome = 'error' AND cart.total_cents > 10000
// Alert if > 5 in 5 minutes

// Feature flag error rate
feature_flag_error_rate = errors / total_requests WHERE feature_flags.new_checkout = true
// Alert if > 2x baseline (rollback trigger)
```

### Dashboard Queries

```sql
-- Real-time business metrics
fields
  sum(case when outcome = 'success' then cart.total_cents else 0 end) / 100 as gmv_dollars,
  count(*) as total_checkouts,
  avg(duration_ms) as avg_duration_ms,
  sum(case when outcome = 'error' then 1 else 0 end) * 100.0 / count(*) as error_rate
| filter path = '/api/checkout'
| stats sum(gmv_dollars) as total_gmv, sum(total_checkouts) as checkouts, avg(avg_duration_ms) as avg_latency, avg(error_rate) as error_pct by bin(5m)
```

---

## Real-World Examples

### Example 1: Debug Slow Checkout for Enterprise User

**Query**:
```sql
fields @timestamp, request_id, duration_ms, user.id, cart.total_cents, timings.*
| filter path = '/api/checkout'
| filter user.subscription = 'enterprise'
| filter duration_ms > 5000
| sort @timestamp desc
| limit 1
```

**Result**:
```json
{
  "@timestamp": "2025-01-15T14:30:00Z",
  "request_id": "abc123",
  "duration_ms": 5240,
  "user": {
    "id": "user_789",
    "subscription": "enterprise",
    "lifetime_value_cents": 500000
  },
  "cart": {
    "total_cents": 25000,
    "item_count": 150
  },
  "timings": {
    "database_ms": 4800,  // ← FOUND IT
    "external_api_ms": 200,
    "business_logic_ms": 240
  }
}
```

**Diagnosis**: Database query taking 4.8s (cart with 150 items hitting N+1 query)

**Action**: Add database index, implement batching

---

### Example 2: Measure Feature Flag Impact on Conversion

**Query**:
```sql
-- Conversion rate comparison: old vs new checkout flow
fields
  feature_flags.new_checkout_flow as new_flow,
  count(*) as total,
  sum(case when outcome = 'success' then 1 else 0 end) as successes
| filter path = '/api/checkout'
| stats sum(total) as attempts, sum(successes) as conversions, (sum(successes) * 100.0 / sum(total)) as conversion_rate by new_flow
```

**Result**:
```
new_flow | attempts | conversions | conversion_rate
---------|----------|-------------|----------------
false    | 50000    | 48500       | 97.0%
true     | 5000     | 4850        | 97.0%
```

**Conclusion**: New checkout flow has identical conversion rate (safe to roll out)

---

### Example 3: Calculate Revenue Impact of Bug

**Query**:
```sql
-- Revenue lost during incident (14:30-15:30)
fields sum(cart.total_cents) / 100 as lost_revenue_dollars
| filter path = '/api/checkout'
| filter outcome = 'error'
| filter @timestamp >= '2025-01-15T14:30:00' and @timestamp <= '2025-01-15T15:30:00'
```

**Result**: $45,000 lost revenue

**With user tier breakdown**:
```sql
fields user.subscription, sum(cart.total_cents) / 100 as lost_revenue_dollars
| filter path = '/api/checkout'
| filter outcome = 'error'
| filter @timestamp >= '2025-01-15T14:30:00' and @timestamp <= '2025-01-15T15:30:00'
| stats sum(lost_revenue_dollars) by user.subscription
```

**Result**:
```
subscription | lost_revenue_dollars
-------------|---------------------
free         | $15,000
premium      | $20,000
enterprise   | $10,000  ← High priority!
```

---

## Next Steps

1. **Read the skill**: `claude --skill wide-event-observability`
2. **Implement logging**: `/setup-wide-logging`
3. **Review implementation**: `/review:logging`
4. **Complete observability**: `/review:observability`
5. **Monitor and iterate**: Refine sampling rules based on your traffic

---

**Further Reading**:
- [loggingsucks.com](https://loggingsucks.com) - Original wide-event philosophy
- [Command Reference](commands.md) - All observability commands
- [Workflows Guide](workflows.md) - Complete observability workflow
