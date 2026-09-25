---
name: wide-event-observability
description: Design and implement wide-event logging with tail sampling for context-rich, queryable observability
when_to_use: When designing logging/observability systems, debugging production incidents with inadequate context, or replacing scattered log statements with canonical log lines
---

# Wide-Event Logging & Observability

You are an observability architect implementing **wide events / canonical log lines** with **tail sampling** to transform logging from "grep text files" to "query structured events with business context."

> **Shared knowledge base.** This is the single source of wide-event / sampling / redaction doctrine for the
> plugin. Both `/wf observability` (the project-level foundation router) and `augment/instrument` (per-change
> signal design) reference it, so the schema, sampling, and redaction rules never drift. When `.ai/observability.md`
> exists, it is the project's *instantiation* of this doctrine — design against its Block-A schema, not from
> scratch.

## Core Philosophy (from loggingsucks.com)

**Traditional logging is broken** because:
1. **Optimized for writing, not querying** - scattered log statements create noise, not insight
2. **Missing business context** - logs lack user tier, feature flags, cart value, account age
3. **String search inadequacy** - grep can't correlate events across services or understand relationships
4. **Multi-search debugging nightmare** - requires multiple searches to understand one request

**The Solution**: Emit **ONE comprehensive event per request per service** containing:
- Technical metadata (timestamps, IDs, duration)
- Business context (user subscription, cart value, feature flags)
- Error details when applicable
- Complete request context in a single queryable event

## The Language-Agnostic Core (read this first)

The wide-event idea is **stack-neutral**. It is *not* an Express middleware or a TypeScript interface — those are
one realization. The concept, in any language or runtime:

> **Emit one context-rich, queryable event per unit of work.** Accumulate context as the unit runs (in a
> request-scoped builder), and emit it **once** at completion. Keep 100% of the signal (errors, slow, VIPs,
> flagged); sample the noise. Normalize field names so every event is queryable the same way.

A "unit of work" is whatever the runtime processes end-to-end: an HTTP request, a queue message, a gRPC call, a
scheduled job, a serverless invocation, a CLI run.

### The canonical field vocabulary (stack-neutral)

| Concept | Canonical field(s) | Why it's here |
|---|---|---|
| Correlation | `request_id`, `trace_id`, `span_id` | tie events across services into one story |
| Service identity | `service`, `version`, `env` | which build, where |
| Outcome | `operation`, `duration_ms`, `outcome`, `status` | what happened and how long it took |
| Actor | `user.id`, `user.tier` | *who* — the cohort dimension every analysis needs |
| Error | `error.type`, `error.code`, `error.retriable` | the failure, structured (not a string) |
| Domain | project-specific (`cart.total_cents`, …) | the business context grep can never give you |

**Normalize keys** — one `user.id`, never `userId` / `user_id` / `uid` across call sites. Divergent keys break
every cohort query silently.

### Adapters realize this per language

The same three moving parts — a **schema** (the fields above), a **tail-sampling function** (keep signal, sample
noise), and a **request-scoped builder + emit-once hook** — are expressed idiomatically per stack. JavaScript is
**one adapter, not the default**:

| Stack | Schema as | Emit-once hook | Structured logger |
|---|---|---|---|
| **Node/TS** *(reference adapter: `wide-event-observability/_adapter-express.md`)* | `interface` / type | HTTP middleware `res.on('finish')` | pino / winston |
| Go | `struct` | `defer` at handler entry | slog / zerolog |
| Python | `dataclass` / `TypedDict` | middleware / decorator / `finally` | structlog / `logging` |
| JVM | record / POJO | servlet filter / interceptor | logback + structured encoder |
| Rust | struct + `serde` | `Drop` guard / middleware | `tracing` |
| .NET | record | middleware | Serilog |

The TypeScript structure below and the adapters in `wide-event-observability/` are
*one worked example of the core above* — port the pattern to the unit's real language; never foist
JavaScript on a non-JS service.

## Wide Event Structure (reference adapter — TypeScript)

The TypeScript `interface` below is the Node adapter's expression of the canonical vocabulary. In Go it is a
`struct`, in Python a `dataclass` — same fields, idiomatic shape.

```typescript
interface WideEvent {
  // Correlation & Identity
  timestamp: string;           // ISO 8601
  request_id: string;          // Correlation across services
  trace_id?: string;           // Distributed tracing
  span_id?: string;

  // Service Context
  service: string;             // "checkout-api"
  version: string;             // "2.1.0"
  deployment_id: string;       // "deploy_abc123"
  region: string;              // "us-east-1"

  // Request Details
  method: string;              // "POST"
  path: string;                // "/api/checkout"
  status_code: number;         // 200
  duration_ms: number;         // 245
  outcome: 'success' | 'error';

  // Business Context (HIGH VALUE)
  user: {
    id: string;
    subscription: 'free' | 'premium' | 'enterprise';
    account_age_days: number;
    lifetime_value_cents: number;
  };

  // Feature Flags (for rollout debugging)
  feature_flags: {
    new_checkout_flow?: boolean;
    beta_payment_ui?: boolean;
  };

  // Domain-Specific Context
  cart?: {
    total_cents: number;
    item_count: number;
    currency: string;
  };

  payment?: {
    provider: 'stripe' | 'paypal';
    method: 'card' | 'bank';
    latency_ms: number;
    attempt: number;
  };

  // Error Details (when applicable)
  error?: {
    type: string;              // "PaymentDeclinedError"
    code: string;              // "card_declined"
    message: string;
    retriable: boolean;
    provider_code?: string;    // Stripe/PayPal specific
  };
}
```

## Tail Sampling Strategy

**Sampling decision happens AFTER request completes:**

```typescript
function shouldSample(event: WideEvent): boolean {
  // ALWAYS keep errors (100%)
  if (event.status_code >= 500) return true;
  if (event.error) return true;

  // ALWAYS keep slow requests (tune threshold to your p99)
  if (event.duration_ms > 2000) return true;

  // ALWAYS keep VIPs / important cohorts
  if (event.user?.subscription === 'enterprise') return true;
  if (event.user?.lifetime_value_cents > 10000_00) return true;

  // ALWAYS keep feature-flagged traffic (for rollout debugging)
  if (event.feature_flags?.new_checkout_flow) return true;

  // Randomly sample the rest (1-5%)
  return Math.random() < 0.05;
}
```

**Why this works:**
- Keep 100% of the signal (errors, slow requests, VIPs, rollouts)
- Sample the noise (successful fast requests from regular users)
- Massive cost savings while retaining debugging power

## Implementation Rules

### Rule 1: One Wide Event Per Request

Replace "diary logs" with a **request-scoped event builder** that accumulates context during handling and emits **once in `finally`**.

**❌ BAD: Scattered logs**
```typescript
app.post('/checkout', async (req, res) => {
  logger.info('Checkout started');
  logger.info(`User: ${req.user.id}`);

  const cart = await getCart(req.user.id);
  logger.info(`Cart total: ${cart.total}`);

  try {
    const payment = await processPayment(cart);
    logger.info(`Payment successful: ${payment.id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(`Payment failed: ${err.message}`);
    throw err;
  }
});
```

**✅ GOOD: Wide event**
```typescript
app.post('/checkout', async (req, res) => {
  const event = req.wideEvent; // Request-scoped builder

  const cart = await getCart(req.user.id);
  event.cart = {
    total_cents: cart.total,
    item_count: cart.items.length,
    currency: cart.currency
  };

  try {
    const paymentStart = Date.now();
    const payment = await processPayment(cart);

    event.payment = {
      provider: payment.provider,
      latency_ms: Date.now() - paymentStart,
      attempt: payment.attempt
    };

    res.json({ ok: true });
  } catch (err: any) {
    event.error = {
      type: err.name,
      code: err.code,
      message: err.message,
      retriable: err.retriable
    };
    throw err;
  }
  // Event emitted automatically in middleware's res.on('finish')
});
```

### Rule 2: Log What Happened to the Request

Do **not** log internal step-by-step narration unless absolutely required. The wide event is the authoritative record.

**Exception**: Infrastructure-level events (service startup, shutdown, health checks) can still be separate structured logs.

### Rule 3: OpenTelemetry Doesn't Add Context For You

If using OTel tracing, **enrich spans/events** with business fields explicitly:

```typescript
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
if (span) {
  span.setAttributes({
    'user.subscription': user.subscription,
    'user.account_age_days': user.accountAgeDays,
    'feature_flags.new_checkout_flow': flags.newCheckoutFlow,
    'cart.total_cents': cart.totalCents
  });
}
```

**OTel is a delivery mechanism, not a decision-maker.** You must instrument business context deliberately.

### Rule 4: Schema Discipline

Define a stable schema (even if flexible) and normalize keys:

**❌ BAD: Inconsistent keys**
```typescript
{ userId: '123' }          // One endpoint
{ user_id: '123' }         // Another endpoint
{ id: '123' }              // Yet another
```

**✅ GOOD: Consistent schema**
```typescript
{
  user: {
    id: '123',
    subscription: 'premium',
    account_age_days: 730
  }
}
```

Use a TypeScript interface or JSON Schema to enforce consistency.

### Rule 5: Security/PII

**Never log:**
- Raw secrets (tokens, passwords, API keys)
- Credit card numbers, SSNs, passwords
- Full request bodies for sensitive endpoints

**Prefer:**
- Hashed/opaque identifiers where possible
- Redaction layer for known sensitive keys
- User ID instead of email/name

```typescript
function redactSensitive(event: WideEvent): WideEvent {
  const redacted = { ...event };

  // Remove sensitive fields
  delete redacted.password;
  delete redacted.creditCard;
  delete redacted.ssn;

  // Hash PII if needed
  if (redacted.email) {
    redacted.email_hash = hashEmail(redacted.email);
    delete redacted.email;
  }

  return redacted;
}
```

## Reference adapters (TypeScript)

The Express/Node.js server adapter lives in `wide-event-observability/_adapter-express.md`, and the React client adapter in `wide-event-observability/_adapter-react.md`. Load one only when the unit's stack matches; on any other stack, port the core above.

## Query Examples (Proving the Value)

These demonstrate the shift from grep → analytics on structured events.

### Query 1: Checkout Failures for Premium Users with Feature Flag

```sql
-- CloudWatch Insights / DataDog / Elastic
SELECT
  error.code,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration
FROM events
WHERE
  path = '/api/checkout'
  AND outcome = 'error'
  AND user.subscription = 'premium'
  AND feature_flags.new_checkout_flow = true
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY error.code
ORDER BY count DESC
```

**Before wide events:** Multiple searches across logs, manual correlation, no way to filter by feature flag.

**After wide events:** Single query with all context.

### Query 2: Payment Latency by Provider and Region

```sql
SELECT
  payment.provider,
  region,
  PERCENTILE(payment.latency_ms, 95) as p95,
  PERCENTILE(payment.latency_ms, 99) as p99
FROM events
WHERE
  path = '/api/checkout'
  AND payment.provider IS NOT NULL
  AND timestamp > NOW() - INTERVAL '24 hours'
GROUP BY payment.provider, region
```

**Insight:** Identify if Stripe is slower in eu-west-1 than us-east-1.

### Query 3: Feature Flag Rollout Impact

```sql
SELECT
  feature_flags.new_checkout_flow as has_flag,
  AVG(duration_ms) as avg_duration,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*) as error_rate
FROM events
WHERE
  path = '/api/checkout'
  AND timestamp > NOW() - INTERVAL '1 hour'
GROUP BY has_flag
```

**Insight:** Compare error rate and latency between flag enabled vs disabled cohorts.

### Query 4: High-Value User Checkout Journey

```sql
SELECT *
FROM events
WHERE
  request_id = 'req_abc123'
ORDER BY timestamp
```

**Insight:** See complete request journey across all services with one query using request_id.

## Success Metrics

Track these to measure improvement:

1. **Mean Time to Resolution (MTTR)**: Should decrease as debugging becomes faster
2. **Log Volume**: Should decrease 80-90% with tail sampling
3. **Query Complexity**: Shift from multi-step grep to single structured queries
4. **Context Completeness**: % of events with business context fields populated

## Common Pitfalls

### Pitfall 1: "We already use structured logging"

**Response**: Structured logging (JSON) is necessary but not sufficient. You must also:
- Emit ONE event per request (not many)
- Include business context (not just technical)
- Use tail sampling (not log everything)

### Pitfall 2: "OpenTelemetry will handle this"

**Response**: OTel is a delivery mechanism. It doesn't decide:
- What business context to capture
- When to sample
- What fields to include

You must instrument business context explicitly.

### Pitfall 3: "We'll add context later"

**Response**: Context must be captured at the moment it's available:
- User subscription tier at auth time
- Cart value when cart is loaded
- Feature flags when flags are evaluated

Adding context retroactively is impossible.

### Pitfall 4: "Sampling will lose important data"

**Response**: Tail sampling keeps 100% of:
- Errors
- Slow requests
- VIPs
- Feature-flagged traffic

You only sample the noise (successful fast requests from regular users).

## Definition of Done

Do not complete until:

- [ ] ONE canonical wide event emitted per request for main HTTP layer
- [ ] Events include consistent correlation IDs (request_id, trace_id)
- [ ] Events include stable field names with documented schema
- [ ] Handlers enrich events with business context (tier, flags, cart/order IDs)
- [ ] Tail sampling implemented with "keep errors/slow/VIPs/flagged" rules
- [ ] Sensitive fields redacted; secrets never logged
- [ ] At least 3 example queries documented demonstrating debugging wins
- [ ] Migration plan documented with phases and rollback strategy
- [ ] Team trained on querying wide events (not grepping logs)

## References

- [Logging Sucks](https://loggingsucks.com/) - Original philosophy
- [OpenTelemetry](https://opentelemetry.io/) - Delivery mechanism (not decision-maker)
- [Structured Logging Best Practices](https://www.structlog.org/)
- [Tail-Based Sampling](https://opentelemetry.io/docs/concepts/sampling/)
