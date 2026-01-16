---
name: review:reliability
description: Review code for reliability, failure modes, and operational safety under partial outages
usage: /review:reliability [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/**/*.ts")'
    required: false
  - name: CONTEXT
    description: 'Additional context: SLOs, failure tolerance, retry policies, critical flows'
    required: false
examples:
  - command: /review:reliability pr 123
    description: Review PR #123 for reliability issues
  - command: /review:reliability worktree "src/services/**"
    description: Review service layer for failure modes
  - command: /review:reliability diff main..feature-branch "CONTEXT: 99.9% uptime SLO, critical payment flow"
    description: Review branch diff with SLO context
---

# Reliability Review

You are a reliability reviewer focusing on failure modes, recoverability, and operational safety under partial outages and unexpected inputs.

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
| add-caching  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-caching`

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

- **`repo`**: Review entire repository
  - Review all source files (exclude tests, docs, config)

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Changed Code

For each file in scope:
1. **Identify changed functions/classes** (for pr/worktree/diff scopes)
2. **Read full context** (entire function/class, not just diff lines)
3. **Note dependencies**: imports, called functions, external services

**Critical**: Always read the **complete function/method body** to understand full context, not just the diff hunks.

## Step 3: Parse CONTEXT (if provided)

Extract reliability expectations from `CONTEXT` parameter:

- **SLOs**: Uptime targets (e.g., "99.9% uptime", "p99 latency < 200ms")
- **Failure tolerance**: Acceptable degradation (e.g., "can serve stale data", "read-only mode OK")
- **Retry policies**: Expected retry behavior (e.g., "3 retries with exponential backoff")
- **Critical flows**: High-stakes operations (e.g., "payment processing", "user authentication")

Example:
```
CONTEXT: 99.9% uptime SLO, critical payment flow, can serve stale cache on DB failure
```

## Step 4: Reliability Checklist Review

For each changed function/class, systematically check:

### 4.1 Timeouts & Deadlines
- [ ] All network calls have explicit timeouts?
- [ ] Database queries have timeouts?
- [ ] HTTP client requests specify timeouts?
- [ ] gRPC calls have deadline context?
- [ ] File I/O operations have timeouts (where applicable)?
- [ ] Timeout values are sensible (not too short, not infinite)?

**Red flags:**
- No timeout specified → can hang forever
- Default timeout used → may not match use case
- Timeout > 30s for user-facing requests → poor UX

### 4.2 Retries & Backoff
- [ ] Retries are bounded (max attempts)?
- [ ] Exponential backoff implemented?
- [ ] Jitter added to prevent thundering herd?
- [ ] Retries only for idempotent operations?
- [ ] Non-retryable errors handled separately (e.g., 4xx vs 5xx)?
- [ ] Retry budget or circuit breaker to prevent retry storms?

**Red flags:**
- Infinite retries → can amplify outage
- No backoff → retry storm crushes downstream
- Retrying non-idempotent writes → data corruption
- No jitter → synchronized retries from multiple clients

### 4.3 Idempotency & Safe Retries
- [ ] Write operations are idempotent or have dedupe?
- [ ] Idempotency keys used for critical writes (payments, orders)?
- [ ] Duplicate detection for messages/events?
- [ ] Safe to retry on network failure?
- [ ] Database transactions properly scoped?

**Red flags:**
- Retry without idempotency key → double charge
- No duplicate detection → duplicate records
- Missing transaction boundary → partial writes

### 4.4 Circuit Breaking & Fallbacks
- [ ] Circuit breaker for flaky dependencies?
- [ ] Graceful degradation when service unavailable?
- [ ] Fallback to cache/default value?
- [ ] User-visible error messages for failures?
- [ ] Avoid cascade failures (fail fast vs retry)?

**Red flags:**
- No circuit breaker → slow cascade failures
- No fallback → complete outage when dependency down
- Silent failures → user sees broken UI

### 4.5 Partial Failure Handling
- [ ] Multi-step operations are atomic or have compensation?
- [ ] Rollback logic for failed steps?
- [ ] Saga pattern for distributed transactions?
- [ ] Documented partial failure behavior?
- [ ] Recovery from mid-operation crash?

**Red flags:**
- Multi-step write with no rollback → inconsistent state
- No compensation logic → manual cleanup needed
- Assume all-or-nothing → breaks on partial failure

### 4.6 Queue & Worker Safety
- [ ] Poison message handling (max retries → DLQ)?
- [ ] Dead letter queue configured?
- [ ] Visibility timeout appropriate for processing time?
- [ ] At-least-once delivery handling (idempotent consumer)?
- [ ] Worker crash recovery (ack after success)?

**Red flags:**
- No DLQ → poison message blocks queue forever
- Ack before processing → message loss on crash
- Visibility timeout too short → duplicate processing

### 4.7 Resource Limits & Exhaustion
- [ ] Connection pool limits configured?
- [ ] Memory limits for unbounded operations (e.g., reading large files)?
- [ ] Thread pool size appropriate?
- [ ] Request rate limiting to prevent overload?
- [ ] Streaming for large datasets vs loading into memory?

**Red flags:**
- Unbounded connection creation → port exhaustion
- Load entire file into memory → OOM on large files
- No rate limiting → thundering herd on startup

### 4.8 Startup & Shutdown Safety
- [ ] Graceful shutdown (drain in-flight requests)?
- [ ] Health check endpoints (readiness, liveness)?
- [ ] Startup dependency checks (DB reachable)?
- [ ] Avoid accepting requests before ready?
- [ ] Cleanup resources on shutdown (close connections)?

**Red flags:**
- Immediate termination → dropped requests
- No readiness check → send traffic before ready
- Resource leaks on shutdown

### 4.9 Consistency Guarantees
- [ ] Eventual vs strong consistency documented?
- [ ] Read-after-write consistency needed?
- [ ] Cache invalidation strategy?
- [ ] Stale data acceptable? For how long?
- [ ] Conflict resolution for concurrent writes?

**Red flags:**
- Assume immediate consistency with eventually consistent DB
- No cache invalidation → serve stale data indefinitely
- No conflict resolution → last write wins (data loss)

### 4.10 Dependency Failure Scenarios
- [ ] What happens if database is down?
- [ ] What happens if cache/Redis is unavailable?
- [ ] What happens if third-party API fails?
- [ ] What happens if message queue is down?
- [ ] Fallback behavior for each dependency?

**Red flags:**
- Single point of failure → complete outage
- No fallback → crash on dependency failure
- Undocumented dependency criticality

## Step 5: Generate Findings

For **each reliability issue** found, create a finding with:

### Finding Format

```markdown
### RL-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**Failure Scenario:**
[Describe concrete scenario when this causes problems]
```
Example sequence:
1. [Step that triggers failure]
2. [Resulting behavior]
3. [Impact on users/system]
```

**Reliability Impact:**
- **Failure Mode:** [How it fails]
- **MTTR Impact:** [Does it increase time to recovery?]
- **Blast Radius:** [Localized vs cascading failure]
- **User Impact:** [What users experience]

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (unreliable)
[current code]

// ✅ AFTER (reliable)
[fixed code with reliability improvements]
```

**Why This Fix:**
[Explain how the fix improves reliability]
```

### Severity Guidelines

- **BLOCKER**: Data loss, corruption, or complete outage under common failure scenarios
  - Example: No timeout on payment API call → can hang forever
  - Example: Retry non-idempotent write → double charge

- **HIGH**: Significant reliability degradation, cascade failures, or poor recovery
  - Example: No circuit breaker → cascade failures
  - Example: No graceful shutdown → dropped requests on deploy

- **MED**: Suboptimal reliability, increased MTTR, or partial degradation
  - Example: No retry backoff → retry storms under load
  - Example: No DLQ → manual intervention needed for poison messages

- **LOW**: Minor reliability improvements, better observability
  - Example: No health check endpoint → harder to debug
  - Example: Timeout slightly too aggressive → rare false positives

- **NIT**: Stylistic or best-practice suggestions
  - Example: Could add jitter to backoff (but already has exponential backoff)

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with SLOs or critical flows:

1. **Check if findings violate SLOs**
   - Example: 99.9% uptime SLO → No timeout = BLOCKER (can cause prolonged outages)

2. **Flag critical flow issues as BLOCKER**
   - Example: "critical payment flow" → No idempotency key = BLOCKER

3. **Validate against stated failure tolerance**
   - Example: "can serve stale cache" → Missing cache fallback = HIGH

## Step 7: Reliability Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** regardless of context:

1. **No timeout on external calls** in user-facing requests
2. **Retry non-idempotent writes** without idempotency key
3. **No graceful shutdown** in production services
4. **Unbounded resource consumption** (memory, connections, threads)
5. **No poison message handling** in queue consumers
6. **Multi-step write with no rollback** and no documented recovery

## Step 8: Write Reliability Report

Create `.claude/<SESSION_SLUG>/reviews/reliability.md`:

```markdown
# Reliability Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## Reliability Posture

### Failure Modes Addressed
- [✅/❌] Timeouts on all external calls
- [✅/❌] Bounded retries with backoff
- [✅/❌] Idempotency for critical writes
- [✅/❌] Circuit breaking / fallbacks
- [✅/❌] Graceful shutdown
- [✅/❌] Poison message handling
- [✅/❌] Resource limits enforced

### Key Concerns
[1-2 sentence summary of most critical reliability gaps]

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## Recommendations

1. **Immediate (BLOCKER):** [Actions for BLOCKER items]
2. **Short-term (HIGH):** [Actions for HIGH items]
3. **Medium-term (MED/LOW):** [Actions for MED/LOW items]

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide context I may have missed
```

## Step 9: Output Summary

Print to console:

```
🔍 Reliability Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

📝 Full report: .claude/<SESSION_SLUG>/reviews/reliability.md

⚠️  BLOCKER items: [list titles]
```

---

## Example Findings

### Example 1: No Timeout on External API Call

```markdown
### RL-1: Payment API Call Has No Timeout [BLOCKER]

**Evidence:**
**File:** `src/services/payment.ts:45`
```typescript
async function chargeCustomer(customerId: string, amount: number) {
  const response = await fetch(`${PAYMENT_API}/charge`, {
    method: 'POST',
    body: JSON.stringify({ customerId, amount }),
    headers: { 'Content-Type': 'application/json' }
  });
  // ❌ No timeout specified
  return response.json();
}
```

**Failure Scenario:**
```
Sequence:
1. Payment API becomes unresponsive (network partition, service degraded)
2. chargeCustomer() hangs indefinitely waiting for response
3. All request handlers calling this function hang
4. Thread pool exhausted → server stops accepting requests
5. Complete service outage

Timeline:
- T+0s: Payment API slow (10s response time)
- T+30s: 100 hanging requests (10 requests/sec)
- T+60s: Thread pool exhausted (max 200 threads)
- T+61s: Server unresponsive, returning 503 to all requests
```

**Reliability Impact:**
- **Failure Mode:** Cascading failure from downstream service
- **MTTR Impact:** Requires server restart (cannot recover automatically)
- **Blast Radius:** Complete outage (all endpoints affected)
- **User Impact:** Users see timeout errors, orders not processed

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no timeout)
const response = await fetch(`${PAYMENT_API}/charge`, {
  method: 'POST',
  body: JSON.stringify({ customerId, amount }),
  headers: { 'Content-Type': 'application/json' }
});

// ✅ AFTER (timeout + retry with backoff)
import pRetry from 'p-retry';

const response = await pRetry(
  async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    try {
      const res = await fetch(`${PAYMENT_API}/charge`, {
        method: 'POST',
        body: JSON.stringify({ customerId, amount }),
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': generateIdempotencyKey(customerId, amount)
        },
        signal: controller.signal
      });

      if (!res.ok) {
        if (res.status >= 500) throw new Error(`Payment API error: ${res.status}`);
        throw new pRetry.AbortError(`Client error: ${res.status}`); // Don't retry 4xx
      }

      return res;
    } finally {
      clearTimeout(timeoutId);
    }
  },
  {
    retries: 3,
    minTimeout: 1000,  // 1s
    maxTimeout: 5000,  // 5s
    factor: 2,         // Exponential backoff
    randomize: true    // Add jitter
  }
);
```

**Why This Fix:**
- **5s timeout**: Fail fast instead of hanging indefinitely
- **Exponential backoff + jitter**: Prevents retry storms (1s → 2s → 4s delays)
- **Bounded retries**: Max 3 attempts → fail after ~15s total (5s * 3)
- **Idempotency key**: Safe to retry writes (prevents double charge)
- **Don't retry 4xx**: Only retry transient 5xx errors
- **Fail fast**: Thread pool not exhausted, service stays responsive
```

### Example 2: No Graceful Shutdown (Dropped Requests)

```markdown
### RL-2: No Graceful Shutdown - Drops In-Flight Requests [HIGH]

**Evidence:**
**File:** `src/server.ts:120`
```typescript
const server = app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down');
  server.close(); // ❌ Immediately stops accepting connections
  process.exit(0); // ❌ Exits immediately, drops in-flight requests
});
```

**Failure Scenario:**
```
Deployment sequence:
1. Kubernetes sends SIGTERM to pod
2. Server immediately closes listener (stops accepting new requests)
3. process.exit(0) kills process immediately
4. 50 in-flight requests aborted mid-processing
5. Users see "Connection reset" errors
6. 0.5% error rate spike during deployments

Per deployment (100 deploys/month):
- 50 requests dropped per deploy
- 5,000 dropped requests/month
- Violates 99.9% uptime SLO
```

**Reliability Impact:**
- **Failure Mode:** Request loss during routine deployments
- **MTTR Impact:** N/A (not an outage, but poor UX)
- **Blast Radius:** Localized to deploying pod
- **User Impact:** Users see errors, retry needed

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (immediate shutdown)
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down');
  server.close();
  process.exit(0);
});

// ✅ AFTER (graceful shutdown with timeout)
const SHUTDOWN_TIMEOUT = 30_000; // 30s max

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, starting graceful shutdown');

  // 1. Stop accepting new connections
  server.close(() => {
    console.log('Server closed to new connections');
  });

  // 2. Wait for in-flight requests to complete (with timeout)
  const shutdownPromise = new Promise<void>((resolve) => {
    server.on('close', resolve);
  });

  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('Shutdown timeout reached, forcing exit');
      resolve();
    }, SHUTDOWN_TIMEOUT);
  });

  await Promise.race([shutdownPromise, timeoutPromise]);

  // 3. Cleanup resources
  await closeDbConnections();
  await closeRedisConnections();

  console.log('Graceful shutdown complete');
  process.exit(0);
});

// Kubernetes readiness probe
app.get('/health/ready', (req, res) => {
  if (isShuttingDown) {
    return res.status(503).json({ status: 'shutting_down' });
  }
  res.json({ status: 'ok' });
});

let isShuttingDown = false;
process.on('SIGTERM', () => {
  isShuttingDown = true; // Signal readiness probe
  // ... rest of shutdown logic
});
```

**Why This Fix:**
- **Drain in-flight requests**: Wait up to 30s for active requests to complete
- **Stop new traffic**: Close server prevents new connections
- **Readiness probe**: Kubernetes stops sending new traffic immediately
- **Forced timeout**: Prevent hanging shutdown (max 30s wait)
- **Resource cleanup**: Close DB/Redis connections gracefully
- **Zero dropped requests**: All in-flight work completes before exit
```

### Example 3: Unbounded Retry Storm

```markdown
### RL-3: Unbounded Retries Amplify Outage [HIGH]

**Evidence:**
**File:** `src/services/database.ts:89`
```typescript
async function queryWithRetry(sql: string, params: any[]) {
  while (true) {  // ❌ Infinite retries
    try {
      return await db.query(sql, params);
    } catch (err) {
      console.error('Query failed, retrying immediately', err);
      // ❌ No backoff, no max retries
    }
  }
}
```

**Failure Scenario:**
```
Database outage sequence:
1. Database goes down (network partition, OOM, crash)
2. 100 app servers × 200 threads/server = 20,000 concurrent requests
3. Each request retries immediately in infinite loop
4. Database receives 20,000 connection attempts/second
5. Database cannot recover (overloaded by retry storm)
6. Manual intervention required to stop app servers

Load amplification:
- Normal load: 1,000 requests/sec
- Retry storm: 20,000 retries/sec (20x amplification)
- Database cannot come back online under load
```

**Reliability Impact:**
- **Failure Mode:** Retry storm prevents recovery
- **MTTR Impact:** Increases recovery time from minutes to hours
- **Blast Radius:** Complete outage, requires manual intervention
- **User Impact:** Extended outage duration

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (infinite retries, no backoff)
async function queryWithRetry(sql: string, params: any[]) {
  while (true) {
    try {
      return await db.query(sql, params);
    } catch (err) {
      console.error('Query failed, retrying immediately', err);
    }
  }
}

// ✅ AFTER (bounded retries, exponential backoff, circuit breaker)
import Bottleneck from 'bottleneck';

const dbLimiter = new Bottleneck({
  maxConcurrent: 100,        // Max 100 concurrent queries
  minTime: 10,               // Min 10ms between queries
  reservoir: 1000,           // Max 1000 queries
  reservoirRefreshAmount: 1000,
  reservoirRefreshInterval: 1000  // Per second
});

const circuitBreaker = {
  failures: 0,
  isOpen: false,
  openedAt: 0,
  threshold: 10,             // Open after 10 failures
  timeout: 30_000,           // Keep open for 30s

  recordFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.isOpen = true;
      this.openedAt = Date.now();
      console.warn('Circuit breaker OPEN - failing fast');
    }
  },

  recordSuccess() {
    this.failures = 0;
    this.isOpen = false;
  },

  shouldAttempt() {
    if (!this.isOpen) return true;

    // Try to close after timeout
    if (Date.now() - this.openedAt > this.timeout) {
      console.log('Circuit breaker half-open - trying request');
      return true;
    }

    return false;
  }
};

async function queryWithRetry(sql: string, params: any[], maxRetries = 3) {
  // Fail fast if circuit breaker is open
  if (!circuitBreaker.shouldAttempt()) {
    throw new Error('Circuit breaker open - database unavailable');
  }

  return await dbLimiter.schedule(async () => {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await db.query(sql, params, {
          statement_timeout: 5000  // 5s query timeout
        });

        circuitBreaker.recordSuccess();
        return result;

      } catch (err) {
        lastError = err as Error;

        // Don't retry syntax errors
        if (err.code === 'SYNTAX_ERROR') {
          throw err;
        }

        if (attempt < maxRetries) {
          // Exponential backoff with jitter: 100ms, 200ms, 400ms
          const baseDelay = 100 * Math.pow(2, attempt);
          const jitter = Math.random() * baseDelay * 0.3;
          const delay = baseDelay + jitter;

          console.warn(`Query failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`, err);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted
    circuitBreaker.recordFailure();
    throw lastError;
  });
}
```

**Why This Fix:**
- **Bounded retries**: Max 3 attempts → fail after ~1s (not infinite)
- **Exponential backoff + jitter**: 100ms → 200ms → 400ms (prevents thundering herd)
- **Circuit breaker**: Stop sending requests after 10 failures (fail fast)
- **Rate limiting**: Max 1,000 queries/sec (prevent overload)
- **Connection pooling**: Max 100 concurrent queries (prevent exhaustion)
- **Query timeout**: 5s max → prevent long-running queries from blocking
- **Recovery**: Circuit half-opens after 30s to test if DB recovered
```

### Example 4: No Idempotency Key for Payment Retry

```markdown
### RL-4: Retry Non-Idempotent Write → Double Charge [BLOCKER]

**Evidence:**
**File:** `src/services/payment.ts:67`
```typescript
async function processPayment(orderId: string, amount: number) {
  try {
    // ❌ No idempotency key - not safe to retry
    const result = await paymentGateway.charge({
      orderId,
      amount,
      currency: 'USD'
    });

    await db.query(
      'INSERT INTO payments (order_id, amount, status) VALUES ($1, $2, $3)',
      [orderId, amount, 'completed']
    );

    return result;

  } catch (err) {
    console.error('Payment failed, retrying...', err);
    return processPayment(orderId, amount);  // ❌ Retry without idempotency
  }
}
```

**Failure Scenario:**
```
Double charge sequence:
1. User clicks "Pay Now" for $100 order
2. Payment gateway charges card successfully ($100 charged)
3. Network timeout before response received
4. Application retries processPayment()
5. Payment gateway charges card again ($100 charged AGAIN)
6. User charged $200 for $100 order

Real-world impact:
- 0.1% of payments experience network timeout
- 1,000 payments/day × 0.1% = 1 double charge/day
- $100 average order = $3,000/month in double charges
- Refunds + customer support + reputation damage
```

**Reliability Impact:**
- **Failure Mode:** Financial loss for customers
- **MTTR Impact:** N/A (data corruption, requires manual refund)
- **Blast Radius:** Every retry attempt = potential double charge
- **User Impact:** Overcharged, trust loss, support tickets

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no idempotency)
async function processPayment(orderId: string, amount: number) {
  try {
    const result = await paymentGateway.charge({
      orderId,
      amount,
      currency: 'USD'
    });
    // ...
  } catch (err) {
    return processPayment(orderId, amount);  // Unsafe retry
  }
}

// ✅ AFTER (idempotency key + deduplication)
import { v4 as uuidv4 } from 'uuid';

async function processPayment(
  orderId: string,
  amount: number,
  idempotencyKey?: string
) {
  // Generate idempotency key if not provided
  if (!idempotencyKey) {
    idempotencyKey = uuidv4();
  }

  // Check if already processed (dedupe)
  const existing = await db.query(
    'SELECT * FROM payments WHERE idempotency_key = $1',
    [idempotencyKey]
  );

  if (existing.rows.length > 0) {
    console.log(`Payment already processed (idempotency_key: ${idempotencyKey})`);
    return existing.rows[0];  // Return cached result
  }

  try {
    // Payment gateway accepts idempotency key
    const result = await paymentGateway.charge({
      orderId,
      amount,
      currency: 'USD',
      idempotencyKey  // ✅ Gateway deduplicates on their side
    });

    // Store with idempotency key
    await db.query(
      `INSERT INTO payments (order_id, amount, status, idempotency_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [orderId, amount, 'completed', idempotencyKey]
    );

    return result;

  } catch (err) {
    // Safe to retry - same idempotency key prevents double charge
    console.error('Payment failed, retrying with same idempotency key', err);

    // Exponential backoff retry
    await new Promise(resolve => setTimeout(resolve, 1000));
    return processPayment(orderId, amount, idempotencyKey);  // ✅ Safe retry
  }
}

// Client side - generate idempotency key once
app.post('/api/checkout', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string || uuidv4();

  const result = await processPayment(
    req.body.orderId,
    req.body.amount,
    idempotencyKey
  );

  res.json(result);
});
```

**Why This Fix:**
- **Idempotency key**: Same key → same result (safe to retry)
- **Gateway deduplication**: Payment gateway deduplicates charges by key
- **Database deduplication**: `ON CONFLICT DO NOTHING` prevents duplicate records
- **Client-provided key**: Client can retry with same key (handle timeout)
- **Cached result**: Return existing payment if already processed
- **Zero double charges**: Retries are safe, no financial risk
```

### Example 5: No Dead Letter Queue for Poison Messages

```markdown
### RL-5: Poison Message Blocks Queue Forever [HIGH]

**Evidence:**
**File:** `src/workers/email-worker.ts:34`
```typescript
async function processEmailQueue() {
  while (true) {
    const message = await queue.receive('email-queue');

    try {
      await sendEmail(message.body);
      await queue.delete(message.receiptHandle);  // ✅ Delete after success
    } catch (err) {
      console.error('Failed to send email', err);
      // ❌ No max retries, no DLQ
      // Message returns to queue after visibility timeout
      // Will retry forever
    }
  }
}
```

**Failure Scenario:**
```
Poison message sequence:
1. Malformed message enters queue: { "to": "invalid-email", "subject": null }
2. Worker picks up message, sendEmail() throws (null subject)
3. Message not deleted, returns to queue after visibility timeout (30s)
4. Worker picks up same message again, fails again
5. Infinite loop - same message processed 2,880 times/day (every 30s)
6. Queue blocked - all other messages stuck behind poison message

Resource waste:
- 2,880 failed attempts/day × 100ms processing = 288s CPU wasted/day
- Queue backlog grows (new messages stuck behind poison message)
- Alert fatigue (error logs flooded with same error)
```

**Reliability Impact:**
- **Failure Mode:** Queue blocked by single bad message
- **MTTR Impact:** Requires manual intervention (delete message)
- **Blast Radius:** All email sending blocked
- **User Impact:** No emails sent (password resets, notifications)

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no DLQ, infinite retries)
async function processEmailQueue() {
  while (true) {
    const message = await queue.receive('email-queue');

    try {
      await sendEmail(message.body);
      await queue.delete(message.receiptHandle);
    } catch (err) {
      console.error('Failed to send email', err);
      // Message returns to queue automatically
    }
  }
}

// ✅ AFTER (max retries + DLQ + metrics)
import { SQSClient, SendMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';

const MAX_RETRIES = 3;
const DLQ_URL = process.env.EMAIL_DLQ_URL;

async function processEmailQueue() {
  while (true) {
    const message = await queue.receive('email-queue', {
      visibilityTimeout: 30,        // 30s to process
      maxNumberOfMessages: 10,      // Batch processing
      waitTimeSeconds: 20           // Long polling
    });

    if (!message) continue;

    try {
      // Parse retry count from message attributes
      const retryCount = parseInt(
        message.attributes?.ApproximateReceiveCount || '0'
      );

      // Move to DLQ after max retries
      if (retryCount >= MAX_RETRIES) {
        console.warn(
          `Message exceeded max retries (${retryCount}), moving to DLQ`,
          { messageId: message.messageId, body: message.body }
        );

        await queue.send(new SendMessageCommand({
          QueueUrl: DLQ_URL,
          MessageBody: message.body,
          MessageAttributes: {
            originalQueue: { StringValue: 'email-queue', DataType: 'String' },
            failureReason: { StringValue: 'max_retries_exceeded', DataType: 'String' },
            retryCount: { StringValue: String(retryCount), DataType: 'Number' }
          }
        }));

        await queue.delete(message.receiptHandle);

        // Alert on DLQ (requires manual investigation)
        await metrics.increment('email.dlq.count', {
          reason: 'max_retries_exceeded'
        });

        continue;
      }

      // Process message
      await sendEmail(JSON.parse(message.body));

      // Success - delete from queue
      await queue.delete(message.receiptHandle);

      await metrics.increment('email.sent.count');

    } catch (err) {
      console.error('Failed to send email', err, {
        messageId: message.messageId,
        retryCount: message.attributes?.ApproximateReceiveCount
      });

      // Check if permanent error (don't retry)
      if (err.code === 'INVALID_EMAIL' || err.code === 'BLOCKED_RECIPIENT') {
        console.warn('Permanent error, moving to DLQ immediately', err);

        await queue.send(new SendMessageCommand({
          QueueUrl: DLQ_URL,
          MessageBody: message.body,
          MessageAttributes: {
            failureReason: { StringValue: err.code, DataType: 'String' }
          }
        }));

        await queue.delete(message.receiptHandle);
      }

      // Transient error - let message return to queue for retry
      // (don't delete, visibility timeout expires automatically)

      await metrics.increment('email.failed.count', {
        error: err.code || 'unknown'
      });
    }
  }
}

// Separate DLQ monitor (alerts on-call)
async function monitorDLQ() {
  const dlqDepth = await queue.getQueueDepth(DLQ_URL);

  if (dlqDepth > 10) {
    await alerts.send({
      severity: 'high',
      title: 'Email DLQ depth high',
      message: `${dlqDepth} messages in DLQ - requires manual investigation`
    });
  }
}

setInterval(monitorDLQ, 60_000);  // Check every minute
```

**Why This Fix:**
- **Max retries**: Move to DLQ after 3 attempts (not infinite)
- **Dead letter queue**: Poison messages don't block queue
- **Permanent error detection**: Invalid emails → DLQ immediately (don't retry)
- **Transient error retry**: Network failures → retry up to 3 times
- **Visibility timeout**: 30s gives enough time to process
- **Batch processing**: Process 10 messages at once (efficiency)
- **Metrics + alerts**: Monitor DLQ depth, alert on-call
- **Manual investigation**: DLQ messages require human review
```

### Example 6: No Fallback for Cache Failure

```markdown
### RL-6: Cache Down → Complete Outage (No Fallback) [MED]

**Evidence:**
**File:** `src/services/product.ts:23`
```typescript
async function getProduct(productId: string) {
  // ❌ No try-catch, no fallback
  const cached = await redis.get(`product:${productId}`);

  if (cached) {
    return JSON.parse(cached);
  }

  const product = await db.query(
    'SELECT * FROM products WHERE id = $1',
    [productId]
  );

  await redis.set(`product:${productId}`, JSON.stringify(product), 'EX', 3600);

  return product;
}
```

**Failure Scenario:**
```
Redis outage sequence:
1. Redis cluster goes down (OOM, network partition, config error)
2. redis.get() throws connection error
3. getProduct() throws, uncaught exception
4. Request handler crashes → 500 error to user
5. All product pages return 500 (cache miss path also broken)
6. 100% error rate until Redis recovered

Impact:
- Redis SLO: 99.95% uptime → 4 hours downtime/year
- 4 hours of complete product page outage
- $10k revenue/hour × 4 hours = $40k revenue loss
- Cache is "enhancement" but became single point of failure
```

**Reliability Impact:**
- **Failure Mode:** Cache becomes single point of failure
- **MTTR Impact:** Depends on Redis recovery time (hours)
- **Blast Radius:** All product pages (core feature)
- **User Impact:** Cannot browse products, errors

**Severity:** MED
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (cache is SPOF)
async function getProduct(productId: string) {
  const cached = await redis.get(`product:${productId}`);

  if (cached) {
    return JSON.parse(cached);
  }

  const product = await db.query(
    'SELECT * FROM products WHERE id = $1',
    [productId]
  );

  await redis.set(`product:${productId}`, JSON.stringify(product), 'EX', 3600);

  return product;
}

// ✅ AFTER (cache failure tolerated)
import { promiseTimeout } from './utils';

const cacheCircuitBreaker = {
  isOpen: false,
  failures: 0,
  threshold: 5,
  openedAt: 0,
  timeout: 60_000  // Close after 1 minute
};

async function getProduct(productId: string) {
  let cached: string | null = null;

  // Try cache (with timeout + circuit breaker)
  if (!cacheCircuitBreaker.isOpen) {
    try {
      cached = await promiseTimeout(
        redis.get(`product:${productId}`),
        500  // 500ms cache timeout (fail fast)
      );

      cacheCircuitBreaker.failures = 0;  // Reset on success

    } catch (err) {
      console.warn('Cache read failed, falling back to database', err);

      cacheCircuitBreaker.failures++;
      if (cacheCircuitBreaker.failures >= cacheCircuitBreaker.threshold) {
        cacheCircuitBreaker.isOpen = true;
        cacheCircuitBreaker.openedAt = Date.now();
        console.error('Cache circuit breaker OPEN - bypassing cache');
      }

      await metrics.increment('cache.read.error', {
        resource: 'product'
      });
    }
  }

  // Cache hit
  if (cached) {
    await metrics.increment('cache.hit', { resource: 'product' });
    return JSON.parse(cached);
  }

  // Cache miss or failure - fetch from database
  await metrics.increment('cache.miss', { resource: 'product' });

  const product = await db.query(
    'SELECT * FROM products WHERE id = $1',
    [productId]
  );

  // Try to write to cache (best-effort, don't fail on error)
  if (!cacheCircuitBreaker.isOpen) {
    try {
      await promiseTimeout(
        redis.set(`product:${productId}`, JSON.stringify(product), 'EX', 3600),
        500  // 500ms write timeout
      );
    } catch (err) {
      console.warn('Cache write failed (non-fatal)', err);
      // Don't throw - cache write is best-effort
    }
  }

  // Periodically try to close circuit breaker
  if (cacheCircuitBreaker.isOpen &&
      Date.now() - cacheCircuitBreaker.openedAt > cacheCircuitBreaker.timeout) {
    console.log('Cache circuit breaker half-open - trying request');
    cacheCircuitBreaker.isOpen = false;
    cacheCircuitBreaker.failures = 0;
  }

  return product;
}

// Health check - distinguish cache vs database failure
app.get('/health', async (req, res) => {
  const health = { status: 'ok', checks: {} };

  try {
    await db.query('SELECT 1');
    health.checks.database = 'ok';
  } catch (err) {
    health.checks.database = 'failing';
    health.status = 'degraded';
  }

  try {
    await promiseTimeout(redis.ping(), 500);
    health.checks.cache = 'ok';
  } catch (err) {
    health.checks.cache = 'failing';
    // Cache failure is non-fatal
  }

  res.status(health.status === 'ok' ? 200 : 503).json(health);
});
```

**Why This Fix:**
- **Fallback to database**: Cache failure → fetch from DB (not crash)
- **Fast timeout**: 500ms cache timeout → fail fast if Redis slow
- **Circuit breaker**: After 5 failures, bypass cache for 1 minute
- **Best-effort cache write**: Write failures don't crash request
- **Metrics**: Track cache hit rate, errors (detect degradation)
- **Health check**: Distinguish cache vs database failure
- **Graceful degradation**: Slower (no cache) but still functional
```

### Example 7: No Compensation for Multi-Step Write Failure

```markdown
### RL-7: Partial Failure Leaves Inconsistent State [MED]

**Evidence:**
**File:** `src/services/order.ts:145`
```typescript
async function createOrder(userId: string, items: Item[]) {
  // Step 1: Create order record
  const order = await db.query(
    'INSERT INTO orders (user_id, status) VALUES ($1, $2) RETURNING *',
    [userId, 'pending']
  );

  // Step 2: Reserve inventory
  for (const item of items) {
    await inventoryService.reserve(item.productId, item.quantity);
  }

  // Step 3: Charge payment
  await paymentService.charge(userId, calculateTotal(items));
  // ❌ If payment fails, inventory is reserved but order not charged

  // Step 4: Update order status
  await db.query(
    'UPDATE orders SET status = $1 WHERE id = $2',
    ['confirmed', order.id]
  );

  return order;
}
```

**Failure Scenario:**
```
Partial failure sequence:
1. User places order for 3 items
2. Step 1 succeeds: Order record created (order_id: 12345)
3. Step 2 succeeds: Inventory reserved for all 3 items
4. Step 3 fails: Payment declined (insufficient funds)
5. Function throws error, execution stops
6. Inventory still reserved (not rolled back)
7. Order stuck in "pending" state (never confirmed or cancelled)

Inconsistent state:
- Order: status = 'pending' (should be 'cancelled')
- Inventory: 3 items reserved (should be released)
- Payment: Not charged (correct)
- User: Cannot re-order (inventory unavailable)

After 100 failed payments:
- 300 items stuck in "reserved" state
- Inventory appears out of stock (but not sold)
- Revenue loss from legitimate orders
```

**Reliability Impact:**
- **Failure Mode:** Inconsistent state across services
- **MTTR Impact:** Requires manual cleanup (find orphaned reservations)
- **Blast Radius:** Inventory accuracy, future orders
- **User Impact:** Cannot purchase items (appears out of stock)

**Severity:** MED
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no rollback)
async function createOrder(userId: string, items: Item[]) {
  const order = await db.query('INSERT INTO orders ...');

  for (const item of items) {
    await inventoryService.reserve(item.productId, item.quantity);
  }

  await paymentService.charge(userId, calculateTotal(items));
  // ❌ Failure here leaves inventory reserved

  await db.query('UPDATE orders SET status = $1 ...', ['confirmed', order.id]);

  return order;
}

// ✅ AFTER (saga pattern with compensation)
async function createOrder(userId: string, items: Item[]) {
  const compensations: Array<() => Promise<void>> = [];

  try {
    // Step 1: Create order record
    const order = await db.query(
      'INSERT INTO orders (user_id, status) VALUES ($1, $2) RETURNING *',
      [userId, 'pending']
    );

    compensations.push(async () => {
      await db.query('DELETE FROM orders WHERE id = $1', [order.id]);
      console.log(`Rolled back order ${order.id}`);
    });

    // Step 2: Reserve inventory (with compensation)
    const reservations: string[] = [];
    for (const item of items) {
      const reservationId = await inventoryService.reserve(
        item.productId,
        item.quantity,
        { orderId: order.id, expiresIn: 300 }  // 5min expiration
      );
      reservations.push(reservationId);
    }

    compensations.push(async () => {
      for (const reservationId of reservations) {
        await inventoryService.release(reservationId);
        console.log(`Released inventory reservation ${reservationId}`);
      }
    });

    // Step 3: Charge payment (with idempotency)
    const payment = await paymentService.charge(
      userId,
      calculateTotal(items),
      { idempotencyKey: `order-${order.id}` }  // Idempotent
    );

    compensations.push(async () => {
      await paymentService.refund(payment.id);
      console.log(`Refunded payment ${payment.id}`);
    });

    // Step 4: Confirm order
    await db.query(
      'UPDATE orders SET status = $1, payment_id = $2 WHERE id = $3',
      ['confirmed', payment.id, order.id]
    );

    // Success - clear compensations (no rollback needed)
    compensations.length = 0;

    return order;

  } catch (err) {
    console.error('Order creation failed, executing compensations', err);

    // Execute compensations in reverse order (LIFO)
    for (const compensate of compensations.reverse()) {
      try {
        await compensate();
      } catch (compensationErr) {
        console.error('Compensation failed', compensationErr);
        // Log to dead letter queue for manual review
        await dlq.send({
          type: 'compensation_failure',
          error: compensationErr,
          context: { userId, items }
        });
      }
    }

    throw err;  // Re-throw original error
  }
}

// Alternative: Database transaction (if all steps are in same DB)
async function createOrderTransactional(userId: string, items: Item[]) {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    const order = await client.query(
      'INSERT INTO orders (user_id, status) VALUES ($1, $2) RETURNING *',
      [userId, 'pending']
    );

    for (const item of items) {
      await client.query(
        'UPDATE inventory SET reserved = reserved + $1 WHERE product_id = $2',
        [item.quantity, item.productId]
      );
    }

    // Payment service call (external, not in transaction)
    // Use idempotency + separate compensation if needed
    const payment = await paymentService.charge(userId, calculateTotal(items));

    await client.query(
      'UPDATE orders SET status = $1, payment_id = $2 WHERE id = $3',
      ['confirmed', payment.id, order.id]
    );

    await client.query('COMMIT');

    return order;

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Why This Fix:**
- **Saga pattern**: Track compensations for each step
- **Automatic rollback**: Compensations executed on failure
- **LIFO order**: Undo in reverse order (last step first)
- **Idempotent compensation**: Safe to retry rollback steps
- **Inventory expiration**: Reservations auto-expire after 5min (safety net)
- **DLQ for failed compensations**: Manual review if rollback fails
- **Transaction alternative**: Use DB transaction if possible (simpler)
- **Consistent state**: Either fully completed or fully rolled back
```

---

## Notes

- **Read full function context**: Always read the entire function/method, not just diff lines
- **Concrete failure scenarios**: Describe exact sequence of events that leads to failure
- **Quantify impact**: Show numbers (requests/sec, error rate, revenue loss)
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after code
- **Cross-reference CONTEXT**: Prioritize findings based on SLOs and critical flows
- **False positives welcome**: Encourage users to challenge findings
