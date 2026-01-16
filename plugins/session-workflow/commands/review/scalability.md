---
name: review:scalability
description: Review code for scalability issues under higher load, larger datasets, and more tenants
usage: /review:scalability [SCOPE] [TARGET] [PATHS] [CONTEXT]
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
    description: 'Additional context: expected growth, concurrency, data volume, multi-tenant architecture'
    required: false
examples:
  - command: /review:scalability pr 123
    description: Review PR #123 for scalability issues
  - command: /review:scalability worktree "src/services/**"
    description: Review service layer for scale bottlenecks
  - command: /review:scalability diff main..feature "CONTEXT: Scaling to 100k users, 1000 RPS, multi-tenant SaaS"
    description: Review branch diff with scale expectations
---

# Scalability Review

You are a scalability reviewer focusing on how behavior changes under higher load, larger datasets, and more tenants.

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
| add-sharding  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-sharding`

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
  - Review all scale-sensitive areas: request handlers, background jobs, data access

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Changed Code

For each file in scope:
1. **Identify changed functions/classes** (for pr/worktree/diff scopes)
2. **Read full context** (entire function/class, not just diff lines)
3. **Identify scale-sensitive areas**:
   - Request handlers (concurrency, throughput)
   - Data access patterns (queries, caching)
   - Background jobs (fanout, batch processing)
   - Shared resources (locks, hot keys, global state)
   - Multi-tenant boundaries (isolation, quotas)

**Critical**: Always read the **complete function/method body** to understand full context, not just the diff hunks.

## Step 3: Parse CONTEXT (if provided)

Extract scale expectations from `CONTEXT` parameter:

- **Growth trajectory**: Current → future scale (e.g., "1k → 100k users")
- **Concurrency**: Simultaneous requests/operations (e.g., "1000 RPS", "10k concurrent users")
- **Data volume**: Dataset size growth (e.g., "100GB → 10TB", "1M records → 100M")
- **Multi-tenant**: Single-tenant vs multi-tenant architecture
- **Geographic distribution**: Single region vs multi-region

Example:
```
CONTEXT: Scaling from 1k to 100k users, 100 RPS to 1000 RPS, multi-tenant SaaS with 500 tenants
```

## Step 4: Scalability Checklist Review

For each changed function/class, systematically check:

### 4.1 Load Amplification
- [ ] Does work per request grow with total data size?
- [ ] Linear scans that become slower as data grows?
- [ ] Aggregations over entire dataset?
- [ ] Joins across large tables?
- [ ] Does 10x data growth → 10x latency?

**Red flags:**
- Query without pagination (loads all records)
- Full table scan in request handler
- Count entire table on every request
- Work proportional to total users (not just active users)

**Scaling behavior:**
```
Bad: O(n) where n = total data size
- 1k records → 100ms
- 10k records → 1000ms (10x slower)
- 100k records → 10,000ms (timeout)

Good: O(1) or O(log n) with pagination/indexing
- 1k records → 10ms
- 10k records → 10ms (constant)
- 100k records → 10ms (constant)
```

### 4.2 Unbounded Operations
- [ ] No pagination or limits on list operations?
- [ ] Fanout without caps (e.g., send to all users)?
- [ ] Unbounded loops or recursion?
- [ ] Growing arrays/lists without bounds?
- [ ] Missing max_results limits?

**Red flags:**
- `SELECT * FROM table` (no LIMIT)
- `for user in all_users: sendEmail(user)` (unbounded fanout)
- Recursive function without depth limit
- Cache without eviction policy

**Scaling behavior:**
```
Bad: Unbounded operation
- 100 users → 100 operations → 500ms
- 10k users → 10k operations → 50 seconds
- 100k users → 100k operations → 8 minutes (timeout)

Good: Paginated, batched, bounded
- Any number of users → max 100 per page → 500ms
- Next page handled by separate request
```

### 4.3 Concurrency Control
- [ ] Locking contention under high concurrency?
- [ ] Shared hot keys (Redis, database)?
- [ ] Single-threaded bottlenecks?
- [ ] Global locks or mutexes?
- [ ] Pessimistic locking on hot records?

**Red flags:**
- Single global counter (all requests increment same key)
- Table-level locks
- Mutex protecting hot path code
- Transactions holding locks for too long

**Scaling behavior:**
```
Bad: Global lock, serializes all requests
- 1 req/sec → 10ms latency
- 100 req/sec → 1000ms latency (queued behind lock)
- 1000 req/sec → 10,000ms latency (complete breakdown)

Good: No shared locks, optimistic locking, sharding
- 1 req/sec → 10ms
- 100 req/sec → 10ms (parallel)
- 1000 req/sec → 10ms (parallel)
```

### 4.4 Backpressure & Rate Limiting
- [ ] Queues with bounded capacity?
- [ ] Worker pools with max concurrency?
- [ ] Rate limiting to prevent overload?
- [ ] Circuit breakers for dependencies?
- [ ] Graceful degradation under load?

**Red flags:**
- Unbounded queue (memory exhaustion)
- No rate limiting on expensive operations
- No circuit breaker (cascading failures)
- Accepting all traffic (no backpressure)

**Scaling behavior:**
```
Bad: No backpressure, queue grows unbounded
- Normal: 100 req/sec, queue empty
- Spike: 10k req/sec, queue grows to 1M items → OOM crash

Good: Bounded queue, reject when full
- Normal: 100 req/sec, queue empty
- Spike: 10k req/sec, queue fills to max 10k, returns 503 for excess
- Recovery: Queue drains, returns to normal
```

### 4.5 Stateful Scaling (Horizontal)
- [ ] In-memory caches that break with multiple instances?
- [ ] Local session storage (should be distributed)?
- [ ] File-based state (should be in database/S3)?
- [ ] WebSocket connections tied to specific instances?
- [ ] Sticky sessions required?

**Red flags:**
- In-memory cache with no invalidation across instances
- Local file storage for user uploads
- Counters stored in instance memory
- WebSocket state not in Redis/DB

**Scaling behavior:**
```
Bad: In-memory cache, inconsistent across instances
- 1 instance → cache hit rate 80%
- 5 instances → cache hit rate 16% (cache miss on other 4 instances)
- Load balancer spreads requests → cache mostly useless

Good: Distributed cache (Redis, Memcached)
- 1 instance → cache hit rate 80%
- 5 instances → cache hit rate 80% (shared cache)
```

### 4.6 Sharding & Partitioning
- [ ] Hot partitions (uneven load distribution)?
- [ ] Partition key choice (tenant ID, user ID, time)?
- [ ] Cross-shard queries or transactions?
- [ ] Rebalancing strategy for new shards?

**Note**: Only flag if sharding is already in use or clearly needed at current scale.

**Red flags:**
- All requests hit same partition (hot partition)
- Time-based partition key (recent data always hot)
- Cross-shard JOINs or transactions
- No strategy for adding shards

**Scaling behavior:**
```
Bad: Hot partition (all traffic to one shard)
- Partition 1: 1000 RPS (overloaded)
- Partition 2: 10 RPS
- Partition 3: 10 RPS
- Adding shards doesn't help (all traffic to shard 1)

Good: Even distribution (hash-based partition key)
- Partition 1: 340 RPS
- Partition 2: 330 RPS
- Partition 3: 330 RPS
- Adding shard 4 → each handles ~250 RPS
```

### 4.7 Multi-Tenant Isolation
- [ ] Noisy neighbor risks (one tenant impacts others)?
- [ ] Per-tenant rate limits and quotas?
- [ ] Query scoping (always filter by tenant_id)?
- [ ] Tenant-specific resource pools?
- [ ] Cross-tenant data leakage risks?

**Red flags:**
- No per-tenant rate limiting (one tenant can DOS others)
- Missing tenant_id filter (query returns all tenants' data)
- Shared connection pool (no isolation)
- No row-level security (RLS)

**Scaling behavior:**
```
Bad: No tenant isolation
- Tenant A: 10 req/sec
- Tenant B: 1000 req/sec (abusive)
- Result: Tenant A sees timeouts, degraded performance

Good: Per-tenant rate limits, quotas
- Tenant A: 10 req/sec (normal)
- Tenant B: 1000 req/sec → rate limited to 100 req/sec after quota
- Result: Tenant A unaffected, Tenant B throttled
```

### 4.8 External Dependencies
- [ ] Third-party API rate limits respected?
- [ ] Retry logic with backoff?
- [ ] Fallback when dependency unavailable?
- [ ] Timeout on external calls?
- [ ] Circuit breaker for flaky dependencies?

**Red flags:**
- No rate limiting for third-party APIs
- Retrying without backoff (hammering dependency)
- No fallback (complete failure when dependency down)
- Synchronous blocking calls to slow dependencies

**Scaling behavior:**
```
Bad: No rate limiting, hit third-party limit
- 100 req/sec → 100 API calls/sec (within limit)
- 1000 req/sec → 1000 API calls/sec → rate limited by provider
- Result: 900 requests fail with 429, users see errors

Good: Queue + rate limit, respect provider limits
- 100 req/sec → 100 API calls/sec (within limit)
- 1000 req/sec → 100 API calls/sec (queue 900)
- Result: 100 processed immediately, 900 queued for later
```

## Step 5: Generate Findings

For **each scalability issue** found, create a finding with:

### Finding Format

```markdown
### SC-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**Scalability Impact:**
- **Current Scale:** [From CONTEXT or estimate]
- **Breaking Point:** [When does it fail?]
- **Scaling Behavior:** [How does it degrade with growth?]
- **Bottleneck:** [What resource/operation limits scale?]

**Scale Analysis:**
```
Current: [X users/requests/data]
- Latency: Y ms
- Throughput: Z req/sec

At 10x scale: [10X users/requests/data]
- Latency: ? ms (projected)
- Throughput: ? req/sec (projected)
- Breaking point: [describe failure mode]
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (doesn't scale)
[current code]

// ✅ AFTER (scales horizontally)
[scalable code]
```

**Why This Fix:**
[Explain scalability improvement and expected behavior at scale]

**Scaling Comparison:**
```
Before: [scaling behavior at 1x, 10x, 100x]
After: [scaling behavior at 1x, 10x, 100x]
```
```

### Severity Guidelines

- **BLOCKER**: Breaks at 2-5x current scale, prevents horizontal scaling
  - Example: Global lock serializes all requests → breaks at 100 RPS
  - Example: Full table scan → timeouts at 10k records

- **HIGH**: Degrades significantly at 10x scale, hard to fix later
  - Example: N+1 queries → 10x slower with 10x users
  - Example: In-memory cache → breaks with multiple instances

- **MED**: Works at 10x scale but issues at 100x, or requires workarounds
  - Example: Missing pagination → slow at 100k records
  - Example: Hot partition → uneven load at high scale

- **LOW**: Minor scalability concern, optimization opportunity
  - Example: Suboptimal query → slightly slower at scale
  - Example: Could use connection pooling

- **NIT**: Stylistic or micro-optimization
  - Example: Could cache this value (negligible impact)

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with scale expectations:

1. **Validate against growth trajectory**
   - Example: "1k → 100k users" → full table scan = BLOCKER

2. **Check concurrency handling**
   - Example: "1000 RPS" → global lock = BLOCKER

3. **Multi-tenant considerations**
   - Example: "multi-tenant SaaS" → no tenant isolation = HIGH

## Step 7: Scalability Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** for production systems:

1. **Global locks** or mutexes in request path (serializes all requests)
2. **Unbounded fanout** (send to all users without pagination)
3. **Full table scans** in request handler on tables with 10k+ rows
4. **In-memory session state** without distributed session store
5. **No rate limiting** in multi-tenant system (noisy neighbor)
6. **Missing tenant_id filter** in queries (cross-tenant data leakage)

## Step 8: Write Scalability Report

Create `.claude/<SESSION_SLUG>/reviews/scalability.md`:

```markdown
# Scalability Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## 0) Scope & Scale Assumptions

### Current Scale
- **Users:** [current user count]
- **Throughput:** [current requests/sec]
- **Data Volume:** [current dataset size]
- **Concurrency:** [current concurrent operations]

### Target Scale (from CONTEXT)
- **Users:** [target user count]
- **Throughput:** [target requests/sec]
- **Data Volume:** [target dataset size]
- **Concurrency:** [target concurrent operations]
- **Growth Factor:** [Nx current scale]

### Architecture Context
- **Deployment:** [Single instance | Horizontal scaling | Sharded | Multi-region]
- **Multi-tenant:** [Yes/No]
- **Data Store:** [Database type, caching layer]

---

## 1) Scale Risks (Ranked by Severity)

### Summary
- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

### Critical Bottlenecks
1. [Most critical bottleneck - what breaks first]
2. [Second critical bottleneck]
3. [Third critical bottleneck]

### Scaling Failure Modes
- **Breaking Point:** [At what scale does system fail?]
- **Primary Limitation:** [What resource/operation limits scale?]
- **Recovery:** [Can system recover after overload?]

---

## 2) Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## 3) Horizontal Scaling Blockers

[List issues that prevent adding more instances]

Example:
- In-memory cache without distributed store
- Local file storage for uploads
- Sticky sessions required

---

## 4) Multi-Tenant Isolation Issues

[List tenant isolation and noisy neighbor risks, if applicable]

Example:
- No per-tenant rate limiting
- Missing tenant_id filters in queries
- Shared resource pools

---

## 5) Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - must fix before scaling]

### Short-term (HIGH)
[Actions for HIGH items - fix before 10x growth]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - optimize for 100x growth]

### Load Testing
[Recommend load testing scenarios to validate fixes]

---

## 6) Scaling Readiness Assessment

### ✅ Scale-Ready Components
[List components that scale well]

### ⚠️  Scale Concerns
[List components with scalability concerns]

### ❌ Scale Blockers
[List components that must be fixed before scaling]

---

## 7) False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide scale context I may have missed
```

## Step 9: Output Summary

Print to console:

```
🔍 Scalability Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

📈 Breaking point: [estimated scale at which system fails]

📝 Full report: .claude/<SESSION_SLUG>/reviews/scalability.md

⚠️  BLOCKER items: [list titles]
```

---

## Example Findings

### Example 1: Global Lock Serializes All Requests

```markdown
### SC-1: Global Counter Lock Serializes All Requests [BLOCKER]

**Evidence:**
**File:** `src/api/analytics.ts:34`
```typescript
// Global mutex protecting counter increment
const counterLock = new Mutex();

app.post('/api/events', async (req, res) => {
  const { eventType, userId } = req.body;

  // ❌ Global lock - only one request can execute at a time
  await counterLock.runExclusive(async () => {
    const count = await redis.get(`counter:${eventType}`);
    await redis.set(`counter:${eventType}`, parseInt(count || '0') + 1);
  });

  await db.insert({ table: 'events', data: { eventType, userId } });

  res.json({ success: true });
});
```

**Scalability Impact:**
- **Current Scale:** 100 requests/sec (from CONTEXT)
- **Breaking Point:** ~300 requests/sec (lock contention becomes dominant)
- **Scaling Behavior:** Linear degradation, then collapse
- **Bottleneck:** Single global lock serializes all requests

**Scale Analysis:**
```
Current: 100 req/sec
- Latency: 20ms average (10ms lock wait + 10ms processing)
- Lock contention: Moderate (10% of time waiting)
- Throughput: 100 req/sec

At 10x scale: 1000 req/sec (target from CONTEXT)
- Latency: 500ms average (490ms lock wait + 10ms processing)
- Lock contention: Severe (98% of time waiting for lock)
- Throughput: ~200 req/sec actual (limited by lock)
- Breaking point: Requests timeout, queue grows unbounded

At 100x scale: 10,000 req/sec
- Latency: 5000ms+ (lock wait dominates)
- Throughput: ~200 req/sec actual (hard limit)
- Result: Complete failure, timeouts, OOM from request queue

Why this doesn't scale:
1. Lock is global (all request types share same lock)
2. Only 1 request processed at a time (serialized)
3. Lock hold time: 10ms per request
4. Max throughput: 1 / 0.01s = 100 req/sec (theoretical)
5. With overhead: ~50-100 req/sec practical limit
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (global lock, serialized)
const counterLock = new Mutex();

app.post('/api/events', async (req, res) => {
  const { eventType, userId } = req.body;

  await counterLock.runExclusive(async () => {
    const count = await redis.get(`counter:${eventType}`);
    await redis.set(`counter:${eventType}`, parseInt(count || '0') + 1);
  });

  await db.insert({ table: 'events', data: { eventType, userId } });

  res.json({ success: true });
});

// ✅ AFTER (atomic Redis operation, lock-free)
app.post('/api/events', async (req, res) => {
  const { eventType, userId } = req.body;

  // Atomic increment (no lock needed)
  await redis.incr(`counter:${eventType}`);

  await db.insert({ table: 'events', data: { eventType, userId } });

  res.json({ success: true });
});

// Alternative: Batch updates (even more efficient)
// Instead of incrementing on every request, buffer and batch

const counterBuffer = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;

app.post('/api/events', async (req, res) => {
  const { eventType, userId } = req.body;

  // Increment in-memory buffer (fast, no Redis call)
  counterBuffer.set(
    eventType,
    (counterBuffer.get(eventType) || 0) + 1
  );

  // Schedule flush (debounced)
  if (!flushTimer) {
    flushTimer = setTimeout(flushCounters, 1000);  // Flush every 1s
  }

  await db.insert({ table: 'events', data: { eventType, userId } });

  res.json({ success: true });
});

async function flushCounters() {
  flushTimer = null;

  if (counterBuffer.size === 0) return;

  // Batch increment to Redis (pipeline)
  const pipeline = redis.pipeline();

  for (const [eventType, count] of counterBuffer.entries()) {
    pipeline.incrby(`counter:${eventType}`, count);
  }

  await pipeline.exec();

  counterBuffer.clear();
}
```

**Why This Fix:**
- **Atomic operation**: Redis INCR is atomic, no lock needed
  - Eliminates lock contention
  - Parallel execution (1000s of req/sec)

- **Batch updates**: Buffer in-memory, flush periodically
  - 1000 increments → 1 Redis call (1000x fewer network round-trips)
  - Near-zero latency for request handler
  - Eventual consistency (acceptable for counters)

**Scaling Comparison:**
```
Before (global lock):
- 100 req/sec → 20ms latency (works)
- 1000 req/sec → 500ms latency (degraded)
- 10,000 req/sec → timeout (broken)

After (atomic Redis INCR):
- 100 req/sec → 5ms latency
- 1000 req/sec → 5ms latency (scales linearly)
- 10,000 req/sec → 10ms latency (still works)
- 100,000 req/sec → 50ms latency (Redis limit, not app limit)

After (batch updates):
- 100 req/sec → 2ms latency (no Redis call per request)
- 1000 req/sec → 2ms latency
- 10,000 req/sec → 2ms latency
- 100,000 req/sec → 5ms latency
- Scales to millions of req/sec (limited by instance count)
```
```

### Example 2: Unbounded Fanout (Send to All Users)

```markdown
### SC-2: Unbounded Fanout - Send Notification to All Users [BLOCKER]

**Evidence:**
**File:** `src/services/notifications.ts:56`
```typescript
async function sendAnnouncementToAllUsers(message: string) {
  // ❌ Fetch ALL users (unbounded query)
  const users = await db.query('SELECT * FROM users');

  // ❌ Send notification to ALL users in loop (unbounded fanout)
  for (const user of users) {
    await emailService.send({
      to: user.email,
      subject: 'Announcement',
      body: message
    });
  }

  console.log(`Sent announcement to ${users.length} users`);
}
```

**Scalability Impact:**
- **Current Scale:** 1,000 users (from CONTEXT)
- **Breaking Point:** ~10,000 users (10+ minutes execution time)
- **Scaling Behavior:** Linear time growth, eventual timeout
- **Bottleneck:** Sequential processing, unbounded operation

**Scale Analysis:**
```
Current: 1,000 users
- Time: 1,000 users × 200ms/email = 200 seconds (~3 minutes)
- Memory: 1,000 users × 1KB = 1MB (manageable)
- Email API: 1,000 calls (within rate limit)

At 10x scale: 10,000 users
- Time: 10,000 × 200ms = 2,000 seconds (~33 minutes)
- Memory: 10,000 × 1KB = 10MB
- Email API: 10,000 calls (may hit rate limit)
- Result: Lambda timeout (15 min max), incomplete send

At 100x scale: 100,000 users (target from CONTEXT)
- Time: 100,000 × 200ms = 20,000 seconds (~5.5 hours)
- Memory: 100,000 × 1KB = 100MB
- Email API: 100,000 calls (definitely hits rate limit)
- Result: Timeout, rate limit, incomplete send, no retry mechanism

Failure modes:
1. Timeout: Process killed mid-execution, some users get email, others don't
2. Rate limit: Email provider blocks after 1,000 emails/hour
3. Memory: If loading 1M users → OOM
4. No progress tracking: Can't resume after failure
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (unbounded fanout, synchronous)
async function sendAnnouncementToAllUsers(message: string) {
  const users = await db.query('SELECT * FROM users');

  for (const user of users) {
    await emailService.send({
      to: user.email,
      subject: 'Announcement',
      body: message
    });
  }
}

// ✅ AFTER (paginated, queued, async)
import { Queue } from 'bullmq';

const emailQueue = new Queue('email-notifications', {
  connection: redis
});

// 1. Enqueue job (fast, returns immediately)
async function sendAnnouncementToAllUsers(message: string) {
  // Create announcement record
  const announcement = await db.insert({
    table: 'announcements',
    data: {
      message,
      status: 'pending',
      created_at: Date.now()
    }
  });

  // Enqueue job (fast)
  await emailQueue.add('send-announcement', {
    announcementId: announcement.id,
    message
  });

  console.log(`Announcement queued: ${announcement.id}`);
  return announcement;
}

// 2. Worker processes in batches (scalable)
async function processAnnouncementWorker(job: Job) {
  const { announcementId, message } = job.data;

  const BATCH_SIZE = 1000;
  let offset = 0;
  let processed = 0;

  while (true) {
    // Fetch batch of users (paginated)
    const users = await db.query(
      'SELECT id, email FROM users ORDER BY id LIMIT $1 OFFSET $2',
      [BATCH_SIZE, offset]
    );

    if (users.length === 0) break;  // Done

    // Send in parallel (bounded concurrency)
    await Promise.all(
      users.map(user =>
        emailQueue.add('send-email', {
          to: user.email,
          subject: 'Announcement',
          body: message,
          userId: user.id,
          announcementId
        })
      )
    );

    processed += users.length;
    offset += BATCH_SIZE;

    // Update progress
    await db.update({
      table: 'announcements',
      where: { id: announcementId },
      data: { processed_count: processed }
    });

    // Report progress
    job.updateProgress((offset / 100000) * 100);  // Estimate total
  }

  // Mark complete
  await db.update({
    table: 'announcements',
    where: { id: announcementId },
    data: { status: 'completed', completed_at: Date.now() }
  });
}

// 3. Email worker (respects rate limits)
import pLimit from 'p-limit';

const emailLimit = pLimit(10);  // Max 10 concurrent email sends

async function processEmailWorker(job: Job) {
  const { to, subject, body, userId, announcementId } = job.data;

  return await emailLimit(async () => {
    try {
      await emailService.send({ to, subject, body });

      // Track delivery
      await db.insert({
        table: 'email_deliveries',
        data: {
          user_id: userId,
          announcement_id: announcementId,
          status: 'sent',
          sent_at: Date.now()
        }
      });

    } catch (err) {
      // Retry on failure (automatic with BullMQ)
      throw err;
    }
  });
}

// Start workers
const worker1 = new Worker('email-notifications', processAnnouncementWorker, {
  connection: redis,
  concurrency: 5  // Process 5 announcements concurrently
});

const worker2 = new Worker('email-queue', processEmailWorker, {
  connection: redis,
  concurrency: 50  // Process 50 emails concurrently
});
```

**Why This Fix:**
- **Pagination**: Process users in batches (1000 at a time)
  - Constant memory usage
  - Can process millions of users

- **Queue-based**: Async processing with job queue
  - API returns immediately (no timeout)
  - Resilient to failures (retries)
  - Progress tracking

- **Bounded concurrency**: Max 10 concurrent email sends
  - Respects email provider rate limits
  - Prevents overload

- **Horizontal scaling**: Add more workers
  - 1 worker → 10 emails/sec
  - 10 workers → 100 emails/sec
  - 100 workers → 1,000 emails/sec

**Scaling Comparison:**
```
Before (unbounded synchronous):
- 1,000 users → 3 minutes (works, but slow)
- 10,000 users → 33 minutes (timeout)
- 100,000 users → 5.5 hours (timeout, incomplete)
- Cannot scale horizontally (single-threaded)

After (paginated, queued):
- 1,000 users → 2 minutes (10 emails/sec × 100 seconds)
- 10,000 users → 16 minutes (same rate, more work)
- 100,000 users → 2.7 hours (same rate, more work)

With 10 workers:
- 1,000 users → 10 seconds
- 10,000 users → 100 seconds (~1.6 minutes)
- 100,000 users → 1,000 seconds (~16 minutes)

With 100 workers:
- 1,000 users → 1 second
- 10,000 users → 10 seconds
- 100,000 users → 100 seconds (~1.6 minutes)
- 1,000,000 users → 1,000 seconds (~16 minutes)

Scales linearly with worker count (horizontal scaling)
```

**Additional Improvements:**
```typescript
// Rate limiting per email provider limit
// Example: SendGrid allows 100 req/sec

const emailLimiter = new Bottleneck({
  maxConcurrent: 50,     // 50 concurrent requests
  minTime: 10,           // Min 10ms between requests (100 req/sec)
  reservoir: 100,        // Max 100 requests
  reservoirRefreshAmount: 100,
  reservoirRefreshInterval: 1000  // Per second
});

// Priority queue (VIP users first)
await emailQueue.add('send-email', { to, subject, body }, {
  priority: user.is_vip ? 1 : 10  // Lower number = higher priority
});

// Batch emails (if provider supports)
// SendGrid: Send to 1,000 users in one API call
const emailBatches = chunk(users, 1000);

for (const batch of emailBatches) {
  await emailService.sendBatch({
    to: batch.map(u => u.email),
    subject: 'Announcement',
    body: message
  });
}
// 100,000 users / 1,000 per batch = 100 API calls (1000x reduction)
```
```

### Example 3: In-Memory Cache Breaks Horizontal Scaling

```markdown
### SC-3: In-Memory Cache Breaks with Multiple Instances [HIGH]

**Evidence:**
**File:** `src/services/products.ts:23`
```typescript
// ❌ In-memory cache (local to each instance)
const productCache = new Map<string, Product>();

async function getProduct(productId: string): Promise<Product> {
  // Check local cache
  if (productCache.has(productId)) {
    return productCache.get(productId)!;
  }

  // Cache miss - fetch from database
  const product = await db.query(
    'SELECT * FROM products WHERE id = $1',
    [productId]
  );

  // Store in local cache
  productCache.set(productId, product);

  return product;
}

async function updateProduct(productId: string, updates: Partial<Product>) {
  await db.query(
    'UPDATE products SET name = $1, price = $2 WHERE id = $3',
    [updates.name, updates.price, productId]
  );

  // ❌ Only invalidates local cache (other instances still have stale data)
  productCache.delete(productId);
}
```

**Scalability Impact:**
- **Current Scale:** 1 instance (from CONTEXT)
- **Breaking Point:** 2+ instances (cache inconsistency)
- **Scaling Behavior:** Cache effectiveness degrades linearly with instance count
- **Bottleneck:** Cannot scale horizontally without distributed cache

**Scale Analysis:**
```
Current: 1 instance
- Cache hit rate: 80% (8 out of 10 requests hit cache)
- Database load: 20% of requests (2 out of 10 query DB)
- Latency: 10ms (cached) or 50ms (DB query)
- Works correctly (single cache)

At 2 instances (horizontal scaling):
- Load balancer distributes: 50% to instance A, 50% to instance B
- Instance A cache: Product X cached
- Instance B cache: Product X NOT cached (different memory space)
- Cache hit rate: 40% overall (each instance has 50% chance of having cached item)
- Database load: 60% of requests (cache mostly misses)

At 5 instances:
- Cache hit rate: 16% (1/5 chance of hitting instance with cached item)
- Database load: 84% of requests
- Cache almost useless (mostly misses)

At 10 instances:
- Cache hit rate: 8% (1/10 chance)
- Database load: 92% of requests
- Adding instances HURTS performance (more cache misses)

Stale data problem:
1. User updates product on instance A
2. Instance A invalidates local cache
3. Instance B, C, D, E still have old cached data
4. Users see stale data until cache expires
5. No coordination between instances
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (in-memory cache, breaks with multiple instances)
const productCache = new Map<string, Product>();

async function getProduct(productId: string): Promise<Product> {
  if (productCache.has(productId)) {
    return productCache.get(productId)!;
  }

  const product = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
  productCache.set(productId, product);
  return product;
}

// ✅ AFTER (distributed Redis cache, scales horizontally)
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3
});

async function getProduct(productId: string): Promise<Product> {
  // Check Redis cache (shared across all instances)
  const cached = await redis.get(`product:${productId}`);

  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - fetch from database
  const product = await db.query(
    'SELECT * FROM products WHERE id = $1',
    [productId]
  );

  // Store in Redis with TTL
  await redis.setex(
    `product:${productId}`,
    3600,  // 1 hour TTL
    JSON.stringify(product)
  );

  return product;
}

async function updateProduct(productId: string, updates: Partial<Product>) {
  await db.query(
    'UPDATE products SET name = $1, price = $2 WHERE id = $3',
    [updates.name, updates.price, productId]
  );

  // Invalidate Redis cache (all instances see invalidation)
  await redis.del(`product:${productId}`);
}

// Alternative: Two-level cache (L1 local + L2 Redis)
// Best of both worlds: Fast local cache + distributed coordination

import NodeCache from 'node-cache';

const localCache = new NodeCache({
  stdTTL: 60,  // 1 minute local TTL (short)
  checkperiod: 10
});

async function getProductTwoLevel(productId: string): Promise<Product> {
  // L1: Check local cache (fast, ~1ms)
  const local = localCache.get<Product>(productId);
  if (local) return local;

  // L2: Check Redis cache (medium, ~5ms)
  const cached = await redis.get(`product:${productId}`);
  if (cached) {
    const product = JSON.parse(cached);
    localCache.set(productId, product);  // Populate L1
    return product;
  }

  // L3: Database (slow, ~50ms)
  const product = await db.query('SELECT * FROM products WHERE id = $1', [productId]);

  // Populate both caches
  await redis.setex(`product:${productId}`, 3600, JSON.stringify(product));
  localCache.set(productId, product);

  return product;
}

async function updateProductTwoLevel(productId: string, updates: Partial<Product>) {
  await db.query(
    'UPDATE products SET name = $1, price = $2 WHERE id = $3',
    [updates.name, updates.price, productId]
  );

  // Invalidate both caches
  await redis.del(`product:${productId}`);
  localCache.del(productId);

  // Publish invalidation event (for other instances)
  await redis.publish('cache:invalidate', JSON.stringify({ key: productId }));
}

// Subscribe to invalidation events (each instance)
const subscriber = redis.duplicate();

subscriber.subscribe('cache:invalidate');

subscriber.on('message', (channel, message) => {
  const { key } = JSON.parse(message);
  localCache.del(key);  // Invalidate local cache
  console.log(`Invalidated local cache for: ${key}`);
});
```

**Why This Fix:**
- **Distributed cache (Redis)**: Shared across all instances
  - Consistent cache hit rate regardless of instance count
  - Cache invalidation visible to all instances
  - Scales horizontally

- **Two-level cache**: Local + Redis
  - L1 (local): Very fast (1ms), short TTL (1 min)
  - L2 (Redis): Fast (5ms), longer TTL (1 hour)
  - Best performance + consistency
  - Pub/sub for invalidation coordination

**Scaling Comparison:**
```
Before (in-memory cache):
- 1 instance: 80% cache hit rate, 10ms avg latency ✅
- 5 instances: 16% cache hit rate, 45ms avg latency ❌
- 10 instances: 8% cache hit rate, 48ms avg latency ❌
- Adding instances HURTS performance

After (Redis cache):
- 1 instance: 80% cache hit rate, 15ms avg latency (slightly slower, Redis network)
- 5 instances: 80% cache hit rate, 15ms avg latency ✅
- 10 instances: 80% cache hit rate, 15ms avg latency ✅
- Adding instances maintains performance

After (two-level cache):
- 1 instance: 80% L1 hit (1ms), 15% L2 hit (5ms), 5% DB (50ms) = 5ms avg
- 5 instances: 80% L1 hit (1ms), 15% L2 hit (5ms), 5% DB (50ms) = 5ms avg
- 10 instances: 80% L1 hit (1ms), 15% L2 hit (5ms), 5% DB (50ms) = 5ms avg
- Best performance + scales horizontally
```

**Trade-offs:**
```
In-memory cache:
✅ Pros: Very fast (1ms), no network latency, no Redis cost
❌ Cons: Doesn't scale horizontally, stale data across instances

Redis cache:
✅ Pros: Scales horizontally, consistent across instances
❌ Cons: Network latency (5ms), Redis hosting cost, single point of failure

Two-level cache:
✅ Pros: Fast + scalable + consistent
❌ Cons: Complexity, invalidation coordination, eventual consistency
```
```

### Example 4: Hot Partition (Uneven Load Distribution)

```markdown
### SC-4: Hot Partition - All Recent Data on One Shard [HIGH]

**Evidence:**
**File:** `src/config/dynamodb.ts:12`
```typescript
// ❌ Time-based partition key (recent data always on same partition)
const tableSchema = {
  TableName: 'Orders',
  KeySchema: [
    {
      AttributeName: 'date',  // ❌ Partition key (YYYY-MM-DD)
      KeyType: 'HASH'
    },
    {
      AttributeName: 'order_id',
      KeyType: 'RANGE'
    }
  ],
  AttributeDefinitions: [
    { AttributeName: 'date', AttributeType: 'S' },
    { AttributeName: 'order_id', AttributeType: 'S' }
  ],
  ProvisionedThroughput: {
    ReadCapacityUnits: 1000,   // 1000 RCUs per partition
    WriteCapacityUnits: 1000   // 1000 WCUs per partition
  }
};

// Queries always target today's partition
async function getTodaysOrders() {
  const today = new Date().toISOString().split('T')[0];  // "2024-01-16"

  return await dynamodb.query({
    TableName: 'Orders',
    KeyConditionExpression: '#date = :today',
    ExpressionAttributeNames: { '#date': 'date' },
    ExpressionAttributeValues: { ':today': today }
  });
}
```

**Scalability Impact:**
- **Current Scale:** 100 orders/day (from CONTEXT)
- **Breaking Point:** ~10,000 orders/day (hot partition throttling)
- **Scaling Behavior:** All traffic concentrated on one partition
- **Bottleneck:** Single partition capacity (1000 WCUs)

**Scale Analysis:**
```
DynamoDB partitioning:
- Partition key (PK) determines which physical partition stores data
- Each partition has limits: 1000 WCUs, 3000 RCUs, 10GB storage
- Time-based PK → all recent writes go to same partition

Current: 100 orders/day = 0.1 orders/sec
- Today's partition: 0.1 WCUs used
- Other partitions (old dates): Idle
- No throttling

At 10x scale: 1,000 orders/day = 1 order/sec
- Today's partition: 1 WCU used
- Other partitions: Idle
- No throttling yet

At 100x scale: 10,000 orders/day = 10 orders/sec
- Today's partition: 10 WCUs used
- Still within 1000 WCU limit
- But uneven load (1 partition gets 100% of writes)

At 1000x scale: 100,000 orders/day = 100 orders/sec
- Today's partition: 100 WCUs used
- Approaching limits

At 10,000x scale: 1,000,000 orders/day = 1000 orders/sec
- Today's partition: 1000 WCUs used (AT LIMIT)
- Throttling begins (ProvisionedThroughputExceededException)
- Other 364 partitions (old dates): Idle, wasted capacity

Problem:
- Table has 1000 WCUs × 365 partitions = 365,000 total WCUs
- But only 1000 WCUs usable (today's partition)
- 364,000 WCUs wasted (99.7% of capacity unused)
- Cannot scale by adding more capacity (still one hot partition)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (time-based partition key - hot partition)
const tableSchema = {
  KeySchema: [
    { AttributeName: 'date', KeyType: 'HASH' },  // ❌ Hot partition
    { AttributeName: 'order_id', KeyType: 'RANGE' }
  ]
};

// ✅ AFTER (user/tenant-based partition key - even distribution)
const tableSchema = {
  TableName: 'Orders',
  KeySchema: [
    {
      AttributeName: 'user_id',  // ✅ Partition key (even distribution)
      KeyType: 'HASH'
    },
    {
      AttributeName: 'created_at#order_id',  // ✅ Composite sort key
      KeyType: 'RANGE'
    }
  ],
  AttributeDefinitions: [
    { AttributeName: 'user_id', AttributeType: 'S' },
    { AttributeName: 'created_at#order_id', AttributeType: 'S' }
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'DateIndex',
      KeySchema: [
        { AttributeName: 'date', KeyType: 'HASH' },  // ✅ Can still query by date via GSI
        { AttributeName: 'created_at', KeyType: 'RANGE' }
      ],
      Projection: { ProjectionType: 'ALL' }
    }
  ]
};

// Query user's orders (uses main table, even load)
async function getUserOrders(userId: string) {
  return await dynamodb.query({
    TableName: 'Orders',
    KeyConditionExpression: 'user_id = :userId',
    ExpressionAttributeValues: { ':userId': userId }
  });
}

// Query today's orders (uses GSI, may still be hot)
async function getTodaysOrders() {
  const today = new Date().toISOString().split('T')[0];

  return await dynamodb.query({
    TableName: 'Orders',
    IndexName: 'DateIndex',
    KeyConditionExpression: '#date = :today',
    ExpressionAttributeNames: { '#date': 'date' },
    ExpressionAttributeValues: { ':today': today }
  });
}

// Alternative: Composite partition key with shard suffix
const tableSchemaSharded = {
  TableName: 'Orders',
  KeySchema: [
    {
      AttributeName: 'date_shard',  // ✅ "2024-01-16#0", "2024-01-16#1", ...
      KeyType: 'HASH'
    },
    {
      AttributeName: 'created_at#order_id',
      KeyType: 'RANGE'
    }
  ]
};

// Write: Distribute across shards
async function createOrder(order: Order) {
  const today = new Date().toISOString().split('T')[0];
  const shard = Math.floor(Math.random() * 10);  // 10 shards per day

  await dynamodb.putItem({
    TableName: 'Orders',
    Item: {
      date_shard: `${today}#${shard}`,  // ✅ Even distribution across 10 partitions
      created_at_order_id: `${Date.now()}#${order.id}`,
      ...order
    }
  });
}

// Query: Fan-out across shards (parallel queries)
async function getTodaysOrdersSharded() {
  const today = new Date().toISOString().split('T')[0];
  const shardCount = 10;

  // Query all shards in parallel
  const queries = Array.from({ length: shardCount }, (_, i) =>
    dynamodb.query({
      TableName: 'Orders',
      KeyConditionExpression: 'date_shard = :dateShard',
      ExpressionAttributeValues: { ':dateShard': `${today}#${i}` }
    })
  );

  const results = await Promise.all(queries);

  // Merge results
  return results.flatMap(r => r.Items);
}
```

**Why This Fix:**
- **User-based partition key**: Distributes load evenly
  - 100k users → 100k partitions
  - Each partition: 10 orders/user (manageable)
  - Scales with user count (horizontal scaling)

- **Shard suffix**: Distribute time-based data across shards
  - 10 shards per day → 10x capacity for today's data
  - 1000 WCUs × 10 shards = 10,000 WCUs for today
  - Scales by increasing shard count

**Scaling Comparison:**
```
Before (date partition key):
- 100 orders/day → 1 partition, 0.1 WCUs used ✅
- 10,000 orders/day → 1 partition, 10 WCUs used ✅
- 100,000 orders/day → 1 partition, 100 WCUs used ✅
- 1,000,000 orders/day → 1 partition, 1000 WCUs used (AT LIMIT) ❌
- Cannot scale beyond 1000 orders/sec (hard limit)

After (user_id partition key):
- 100 orders/day, 10 users → 10 partitions, 0.01 WCUs each ✅
- 10,000 orders/day, 1000 users → 1000 partitions, 0.01 WCUs each ✅
- 100,000 orders/day, 10k users → 10k partitions, 0.01 WCUs each ✅
- 1,000,000 orders/day, 100k users → 100k partitions, 0.01 WCUs each ✅
- Scales linearly with user count

After (sharded date partition):
- 100 orders/day → 10 partitions, 0.01 WCUs each ✅
- 10,000 orders/day → 10 partitions, 1 WCU each ✅
- 100,000 orders/day → 10 partitions, 10 WCUs each ✅
- 1,000,000 orders/day → 10 partitions, 100 WCUs each ✅
- 10,000,000 orders/day → 10 partitions, 1000 WCUs each (at limit)
- Can scale further by increasing shard count (20 shards → 20k orders/sec)
```

**Partition Key Selection Guide:**
```
✅ Good partition keys (even distribution):
- user_id (if many users)
- tenant_id (in multi-tenant systems)
- device_id
- Hash of email/username
- UUID with shard suffix

❌ Bad partition keys (hot partitions):
- date/timestamp (recent data always hot)
- status (e.g., "pending" vs "completed" - uneven)
- boolean flags (only 2 partitions)
- Low-cardinality fields (category, type, etc.)
```
```

### Example 5: Missing Per-Tenant Rate Limiting (Noisy Neighbor)

```markdown
### SC-5: No Per-Tenant Rate Limiting - Noisy Neighbor Risk [HIGH]

**Evidence:**
**File:** `src/api/data.ts:45`
```typescript
// ❌ No per-tenant rate limiting (one tenant can impact all others)
app.post('/api/data/import', async (req, res) => {
  const { tenantId, data } = req.body;

  // ❌ No rate limit check per tenant
  for (const item of data) {
    await db.insert({
      table: 'records',
      data: {
        tenant_id: tenantId,
        ...item
      }
    });
  }

  res.json({ imported: data.length });
});
```

**Scalability Impact:**
- **Current Scale:** 10 tenants, 100 requests/day per tenant (from CONTEXT)
- **Breaking Point:** One abusive tenant can impact all others
- **Scaling Behavior:** No isolation, noisy neighbor problem
- **Bottleneck:** Shared resources without quotas

**Scale Analysis:**
```
Current: 10 tenants, 100 req/day each = 1,000 req/day total
- Tenant A: 100 req/day (normal)
- Tenant B: 100 req/day (normal)
- System load: Low, no issues

Noisy neighbor scenario:
- Tenant A: 100 req/day (normal)
- Tenant B: 100,000 req/day (abusive - 1000x normal)
- Total: 100,100 req/day

Impact on Tenant A:
- Database overloaded (100k inserts from Tenant B)
- Tenant A requests timeout (shared DB connection pool)
- Tenant A experiences degraded service (not their fault)
- No isolation between tenants

At 100 tenants:
- 99 tenants: Normal usage
- 1 tenant: Abusive usage (100k req/day)
- Result: All 99 tenants experience degraded service
- One bad tenant ruins experience for all

Multi-tenant SaaS failure:
- No way to isolate misbehaving tenants
- Cannot scale (one tenant uses all resources)
- Support tickets from impacted tenants
- Churn risk (good tenants leave)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no per-tenant limits)
app.post('/api/data/import', async (req, res) => {
  const { tenantId, data } = req.body;

  for (const item of data) {
    await db.insert({ table: 'records', data: { tenant_id: tenantId, ...item } });
  }

  res.json({ imported: data.length });
});

// ✅ AFTER (per-tenant rate limiting + quotas)
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Per-tenant rate limiter
const createTenantRateLimiter = () => rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: 'ratelimit:tenant:'
  }),
  windowMs: 60 * 1000,  // 1 minute window
  max: async (req) => {
    const { tenantId } = req.body;

    // Get tenant plan (different limits per plan)
    const tenant = await getTenant(tenantId);

    switch (tenant.plan) {
      case 'free': return 10;        // 10 requests/minute
      case 'starter': return 100;    // 100 requests/minute
      case 'pro': return 1000;       // 1000 requests/minute
      case 'enterprise': return 10000; // 10k requests/minute
      default: return 10;
    }
  },
  keyGenerator: (req) => {
    // Key by tenant_id (not IP address)
    return req.body.tenantId;
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please upgrade your plan or try again later.',
      retry_after: res.getHeader('Retry-After')
    });
  }
});

app.post('/api/data/import',
  createTenantRateLimiter(),  // ✅ Per-tenant rate limit
  async (req, res) => {
    const { tenantId, data } = req.body;

    // Check tenant daily quota
    const today = new Date().toISOString().split('T')[0];
    const quotaKey = `quota:${tenantId}:${today}`;
    const used = await redis.get(quotaKey) || 0;

    const tenant = await getTenant(tenantId);
    const dailyQuota = getTenantQuota(tenant.plan);

    if (parseInt(used) + data.length > dailyQuota) {
      return res.status(429).json({
        error: 'Daily quota exceeded',
        message: `You have exceeded your daily quota of ${dailyQuota} records.`,
        quota: dailyQuota,
        used: parseInt(used),
        remaining: Math.max(0, dailyQuota - parseInt(used))
      });
    }

    // Process import (with batching)
    const BATCH_SIZE = 1000;
    const batches = chunk(data, BATCH_SIZE);

    for (const batch of batches) {
      await db.insertMany({
        table: 'records',
        data: batch.map(item => ({ tenant_id: tenantId, ...item }))
      });
    }

    // Update quota usage
    await redis.incrby(quotaKey, data.length);
    await redis.expire(quotaKey, 86400);  // Expire after 24 hours

    res.json({
      imported: data.length,
      quota: {
        limit: dailyQuota,
        used: parseInt(used) + data.length,
        remaining: dailyQuota - (parseInt(used) + data.length)
      }
    });
  }
);

// Helper: Get tenant quota based on plan
function getTenantQuota(plan: string): number {
  const quotas = {
    free: 1000,          // 1k records/day
    starter: 10000,      // 10k records/day
    pro: 100000,         // 100k records/day
    enterprise: 1000000  // 1M records/day
  };

  return quotas[plan] || quotas.free;
}

// Alternative: Tenant-specific resource pools
// Separate database connection pools per tenant tier

const freeTierPool = new Pool({ max: 5 });      // 5 connections for free tier
const proTierPool = new Pool({ max: 20 });      // 20 connections for pro tier
const enterprisePool = new Pool({ max: 100 });  // 100 connections for enterprise

function getPoolForTenant(tenant: Tenant): Pool {
  switch (tenant.plan) {
    case 'enterprise': return enterprisePool;
    case 'pro': return proTierPool;
    default: return freeTierPool;
  }
}

app.post('/api/data/import', async (req, res) => {
  const { tenantId, data } = req.body;
  const tenant = await getTenant(tenantId);
  const pool = getPoolForTenant(tenant);  // ✅ Isolated connection pool

  // Use tenant-specific pool (noisy neighbor isolated)
  await pool.query('INSERT INTO records ...', [...data]);

  res.json({ imported: data.length });
});
```

**Why This Fix:**
- **Per-tenant rate limiting**: Isolates tenants
  - Tenant B abuse → Tenant B gets 429 errors
  - Tenant A unaffected (separate rate limit)

- **Daily quotas**: Prevents runaway usage
  - Free tier: 1k records/day (prevents abuse)
  - Pro tier: 100k records/day (higher limit)
  - Enterprise: 1M records/day (highest limit)

- **Separate resource pools**: Isolates DB load
  - Free tier: 5 connections (limited impact)
  - Pro tier: 20 connections (more capacity)
  - Enterprise: 100 connections (dedicated)

**Scaling Comparison:**
```
Before (no tenant isolation):
- Normal: 100 tenants × 100 req/day = 10k req/day (works)
- Noisy neighbor: 1 tenant × 100k req/day + 99 tenants × 100 req/day = 110k req/day
  - All 100 tenants experience degraded service
  - Database overloaded
  - Support tickets from all tenants

After (per-tenant rate limiting):
- Normal: 100 tenants × 100 req/day = 10k req/day (works)
- Noisy neighbor: 1 tenant rate limited to plan quota
  - Abusive tenant: Rate limited to 1000 req/min (plan limit)
  - Other 99 tenants: Unaffected, normal service
  - Database load controlled
  - Only abusive tenant contacts support

Per-plan quotas:
- Free tier (1k/day): 1,000 tenants × 1k = 1M records/day max
- Pro tier (100k/day): 100 tenants × 100k = 10M records/day max
- Predictable load, cannot exceed limits
```

**Additional Tenant Isolation:**
```typescript
// 1. Query scoping (always filter by tenant_id)
app.get('/api/records', async (req, res) => {
  const { tenantId } = req.user;

  // ✅ Always scope to tenant (prevent cross-tenant data access)
  const records = await db.query(
    'SELECT * FROM records WHERE tenant_id = $1',
    [tenantId]
  );

  res.json(records);
});

// 2. Row-Level Security (RLS) in PostgreSQL
await db.query(`
  ALTER TABLE records ENABLE ROW LEVEL SECURITY;

  CREATE POLICY tenant_isolation ON records
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
`);

// Set tenant context for each request
app.use((req, res, next) => {
  req.dbPool = new Pool({
    database: 'mydb',
    // Set session variable for RLS
    options: `-c app.current_tenant=${req.user.tenantId}`
  });
  next();
});

// 3. Separate databases per tenant (highest isolation)
function getDatabaseForTenant(tenantId: string): Pool {
  return new Pool({
    database: `tenant_${tenantId}`,  // Separate database per tenant
    max: 10
  });
}
// ✅ Complete isolation, noisy neighbor impossible
// ❌ Cons: Operational complexity, cost, cross-tenant queries impossible
```
```

---

## Notes

- **Read full function context**: Always read the entire function/method, not just diff lines
- **Analyze scaling behavior**: Show how latency/throughput changes at 10x, 100x scale
- **Identify breaking points**: At what scale does it fail?
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after code
- **Cross-reference CONTEXT**: Use growth trajectory and target scale to prioritize
- **Horizontal scaling**: Flag issues that prevent adding more instances
- **Multi-tenant isolation**: Check for noisy neighbor risks if applicable
- **False positives welcome**: Encourage users to challenge scale estimates
