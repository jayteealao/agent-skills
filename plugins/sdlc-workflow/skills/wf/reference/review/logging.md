---
description: "Review logging for secrets exposure, PII leaks, wide-event patterns, and query-optimized observability"
argument-hint: "[scope] [target] [paths]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# Logging Review

You are a logging and observability reviewer following the **wide-event philosophy** from loggingsucks.com. You review code for:
1. **Safety**: Secrets/PII exposure in logs
2. **Quality**: Consistent fields, correlation IDs, structured logging
3. **Levels**: Appropriate log levels (not everything is INFO)
4. **Noise**: Hot-path logs, excessive logging
5. **Structure**: Wide events vs scattered logs
6. **Privacy**: PII redaction, data minimization

## NON-NEGOTIABLES

1. **Evidence-first**: every finding includes a `file:line` reference plus the quoted log statement that shows the defect.
2. **Severity + Confidence**: every finding carries both ratings.
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Category**: every finding names one checklist category (Safety, Privacy, Quality, Levels, Noise, Structure).
4. **Remediation**: every BLOCKER or HIGH finding includes a concrete fix.

## Core Philosophy: Wide Events

**Traditional logging is broken:**
- Scattered log statements create noise, not insight
- Grep can't correlate events across services
- Missing business context (user tier, feature flags, cart value)
- Multi-search debugging nightmare

**The solution: Wide Events**
- ONE comprehensive event per request with full context
- Emit AFTER request completes (tail sampling)
- Include business context (tier, flags, cart, payment)
- Sample intelligently (keep errors/slow/VIPs, discard noise)

## Logging Review Checklist

### Category 1: Safety (Secrets & Credentials)

**BLOCKER if found:**
- [ ] API keys, tokens, passwords in logs
- [ ] Authorization headers logged
- [ ] Database connection strings with passwords
- [ ] JWT tokens (full token, not just header/payload)
- [ ] Credit card numbers, SSNs
- [ ] Private keys, certificates
- [ ] Session tokens, cookies
- [ ] OAuth secrets

**Common vulnerable patterns:**
```typescript
// ❌ BLOCKER: Secret exposure
logger.info('API call', { headers: req.headers }); // Contains Authorization
logger.debug('Config loaded', { config }); // Contains DB password
logger.info('User created', { password: user.password }); // Plaintext password
logger.error('Auth failed', { token: req.body.token }); // JWT token
console.log({ stripe_key: process.env.STRIPE_SECRET_KEY }); // API key
```

**Safe patterns:**
```typescript
// ✅ Safe: Redact sensitive headers
logger.info('API call', {
  headers: {
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'],
    // Don't log authorization, cookie
  }
});

// ✅ Safe: Hash or omit secrets
logger.info('User created', {
  userId: user.id,
  email_hash: hashEmail(user.email),
  // Don't log password
});
```

### Category 2: Privacy (PII Exposure)

**HIGH if found:**
- [ ] Email addresses in logs
- [ ] Full names, addresses
- [ ] Phone numbers
- [ ] IP addresses (consider hashing)
- [ ] User-generated content with PII
- [ ] Payment method details (last 4 digits OK)
- [ ] Geolocation data
- [ ] Health information

**PII minimization:**
```typescript
// ❌ HIGH: PII exposure
logger.info('User registered', {
  email: user.email,
  name: user.fullName,
  address: user.address,
  phone: user.phone,
});

// ✅ Better: Hash or omit PII
logger.info('User registered', {
  user_id: user.id,
  email_hash: sha256(user.email),
  country: user.country, // Aggregated location OK
  // Don't log email, name, address, phone
});

// ✅ Best: Use opaque IDs
logger.info('User registered', {
  user_id: user.id,
  account_type: user.subscription,
});
```

**GDPR/CCPA compliance:**
- Logs are subject to "right to deletion"
- If you log PII, you must be able to delete it
- Prefer hashed IDs or aggregated data

### Category 3: Quality (Structured Logging)

**HIGH if found:**
- [ ] String concatenation instead of structured fields
- [ ] Inconsistent field names (`userId` vs `user_id` vs `id`)
- [ ] Missing correlation IDs
- [ ] Unstructured text logs
- [ ] Missing context (no user, session, request ID)
- [ ] Logs can't be parsed or queried

**String concatenation (bad):**
```typescript
// ❌ HIGH: Unstructured logging
logger.info('User ' + userId + ' purchased ' + amount + ' items');
logger.info(`Order ${orderId} failed with error ${error.message}`);

// Grep-only, can't query "show me all orders > $100"
```

**Structured logging (good):**
```typescript
// ✅ Good: Structured fields
logger.info('Purchase completed', {
  user_id: userId,
  order_id: orderId,
  item_count: amount,
  total_cents: totalCents,
  currency: 'USD',
});

// Now queryable: WHERE item_count > 10 AND total_cents > 10000
```

**Consistent field names:**
```typescript
// ❌ MED: Inconsistent naming
logger.info({ userId: '123' });      // camelCase
logger.info({ user_id: '123' });     // snake_case
logger.info({ UserID: '123' });      // PascalCase
logger.info({ id: '123' });          // Ambiguous

// ✅ Good: Consistent schema
logger.info({ user_id: '123' });     // Always snake_case
logger.info({ user_id: '456' });
logger.info({ user_id: '789' });
```

**Correlation IDs:**
```typescript
// ❌ HIGH: No correlation ID
logger.info('Request started');
logger.info('Database query');
logger.info('Request completed');

// Can't correlate these 3 logs across distributed services

// ✅ Good: Correlation ID in every log
logger.info('Request started', { request_id: 'req_abc' });
logger.info('Database query', { request_id: 'req_abc' });
logger.info('Request completed', { request_id: 'req_abc' });

// ✅ Better: Wide event (one log, full context)
// Logged automatically at end of request
```

### Category 4: Levels (Appropriate Log Levels)

**MED if found:**
- [ ] Everything logged as INFO
- [ ] DEBUG logs in production hot paths
- [ ] ERROR for expected failures (e.g., 404)
- [ ] WARN never used
- [ ] INFO for sensitive operations (should be WARN/ERROR)

**Log level guidelines:**

| Level   | Use Case | Example |
|---------|----------|---------|
| ERROR   | Unexpected failures requiring immediate attention | Unhandled exception, database down, payment provider error |
| WARN    | Degraded state, retries, potential issues | Retry attempt, slow query, deprecated API usage, rate limit approaching |
| INFO    | Normal operations, business events | Request completed, user logged in, order placed (use wide events) |
| DEBUG   | Development debugging (not production) | Variable values, control flow, intermediate steps |
| TRACE   | Very verbose debugging | Every function call, loop iterations |

**Anti-patterns:**
```typescript
// ❌ MED: Wrong log levels
logger.error('User not found'); // Expected 404, not ERROR
logger.info('Database connection failed'); // Should be ERROR
logger.debug('Request completed', { duration: 123 }); // Should be INFO
logger.info('Variable x =', x); // Should be DEBUG (or remove)

// ✅ Good: Appropriate levels
logger.warn('User not found', { user_id: userId }); // 404 is WARN
logger.error('Database connection failed', { error: err.message }); // ERROR
logger.info('Request completed', { duration_ms: 123 }); // Wide event at INFO
// Don't log variable values in production
```

**ERROR vs WARN:**
- **ERROR**: Something broke that shouldn't have (alerts, on-call)
- **WARN**: Something unexpected but handled (retries, degraded mode)

```typescript
// ❌ Wrong: Retries logged as ERROR
try {
  await fetchData();
} catch (err) {
  logger.error('Fetch failed, retrying...', { error: err }); // Should be WARN
  await retry();
}

// ✅ Right: WARN for retries, ERROR for final failure
try {
  await fetchData();
} catch (err) {
  logger.warn('Fetch failed, retrying...', { error: err.message, attempt: 1 });
  try {
    await retry();
  } catch (finalErr) {
    logger.error('Fetch failed after retries', { error: finalErr.message });
    throw finalErr;
  }
}
```

### Category 5: Noise (Over-logging in Hot Paths)

**HIGH if found:**
- [ ] Log statement inside tight loop
- [ ] Log on every request (no sampling)
- [ ] Multiple logs per request (diary logging)
- [ ] DEBUG/TRACE in production
- [ ] Logging large payloads (>1KB)

**Hot-path over-logging:**
```typescript
// ❌ HIGH: Log inside loop (1M items = 1M log lines)
for (const item of items) {
  logger.info('Processing item', { id: item.id });
  process(item);
}

// ✅ Better: Log summary
logger.info('Processing items', { count: items.length });
for (const item of items) {
  process(item);
}
logger.info('Items processed', { count: items.length, duration_ms: Date.now() - start });

// ✅ Best: Wide event with aggregates
event.processing = {
  item_count: items.length,
  duration_ms: Date.now() - start,
  errors: errorCount,
};
```

**Diary logging (scattered logs):**
```typescript
// ❌ HIGH: Multiple logs per request (6 log lines)
logger.info('Checkout started');
logger.info('User authenticated', { userId });
logger.info('Cart loaded', { cartId });
logger.info('Payment processing');
logger.info('Payment succeeded', { orderId });
logger.info('Checkout completed');

// ✅ Wide event: ONE log with full context
event.user = { id: userId };
event.cart = { id: cartId, total_cents: cart.total };
event.payment = { order_id: orderId, provider: 'stripe' };
// Logged automatically at end of request
```

**Large payloads:**
```typescript
// ❌ MED: Logging large objects (10KB+ per log)
logger.info('Response', { body: largeResponse }); // 10KB
logger.debug('Full request', { req }); // Contains entire request

// ✅ Better: Log summary
logger.info('Response', {
  status: 200,
  size_bytes: JSON.stringify(largeResponse).length,
  // Don't log full body
});
```

**Sampling for high-volume endpoints:**
```typescript
// ❌ HIGH: Log every request (10k req/s = 10k logs/s)
app.get('/api/health', (req, res) => {
  logger.info('Health check');
  res.json({ ok: true });
});

// ✅ Better: Sample or don't log health checks
app.get('/api/health', (req, res) => {
  // Don't log health checks (not useful)
  res.json({ ok: true });
});

// ✅ Wide event with tail sampling (automatic)
// Keeps errors, slow requests, VIPs
// Samples 5% of success
```

### Category 6: Structure (Wide Events vs Scattered Logs)

**MED if found:**
- [ ] Multiple log statements per request
- [ ] No single canonical log line
- [ ] Missing business context (user tier, flags, cart)
- [ ] Can't query "show me failed checkouts for premium users"
- [ ] Log early (at start) instead of late (at end)

**Scattered logging (bad):**
```typescript
// ❌ MED: Scattered logs (hard to correlate, missing context)
app.post('/api/checkout', async (req, res) => {
  logger.info('Checkout started', { userId: req.user.id });

  const cart = await getCart(req.user.id);
  logger.info('Cart loaded', { total: cart.total });

  try {
    const payment = await processPayment(cart);
    logger.info('Payment succeeded', { orderId: payment.orderId });
    res.json({ ok: true });
  } catch (err) {
    logger.error('Payment failed', { error: err.message });
    res.status(500).json({ error: 'Failed' });
  }
});

// Problems:
// - 4 log lines per request (noise)
// - Missing: status code, duration, user subscription, feature flags
// - Can't query: "show me premium user failures with new payment flow"
```

**Wide event (good):**
```typescript
// ✅ Good: ONE wide event with full context
app.post('/api/checkout', async (req, res) => {
  const event = req.wideEvent; // From middleware

  // Add business context
  event.user = {
    id: req.user.id,
    subscription: req.user.subscription,
    account_age_days: daysSince(req.user.createdAt),
  };

  event.feature_flags = req.featureFlags;

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

  // ONE log emitted automatically at end with:
  // - user.subscription, user.account_age_days
  // - cart.total_cents, cart.item_count
  // - payment.provider, payment.latency_ms
  // - error.code (if failed)
  // - status_code, duration_ms, outcome
  // - feature_flags (for A/B testing)
});

// Now queryable:
// WHERE outcome='error' AND user.subscription='premium' AND feature_flags.new_flow=true
```

**Wide event benefits:**
1. **One query instead of many greps**: Full context in one event
2. **Business context**: User tier, LTV, feature flags
3. **Tail sampling**: Keep errors/slow/VIPs, sample rest (90% cost reduction)
4. **Queryable**: SQL-like queries instead of grep

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
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- Wide Event Observability Skill - Implementation guide
