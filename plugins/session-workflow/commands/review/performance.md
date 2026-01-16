---
name: review:performance
description: Review code for algorithmic and system-level performance issues
usage: /review:performance [SCOPE] [TARGET] [PATHS] [CONTEXT]
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
    description: 'Additional context: performance goals, latency budget, throughput, typical data sizes'
    required: false
examples:
  - command: /review:performance pr 123
    description: Review PR #123 for performance issues
  - command: /review:performance worktree "src/api/**"
    description: Review API layer for performance regressions
  - command: /review:performance diff main..feature "CONTEXT: p95 < 200ms, 10k requests/sec, typical 1000 items/page"
    description: Review branch diff with performance goals
---

# Performance Review

You are a performance reviewer identifying algorithmic and system-level inefficiencies and ensuring performance complexity matches the real workload.

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
| add-pagination  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-pagination`

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
  - Focus on hot paths: API handlers, frequent functions, data processing

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Changed Code

For each file in scope:
1. **Identify changed functions/classes** (for pr/worktree/diff scopes)
2. **Read full context** (entire function/class, not just diff lines)
3. **Identify hot paths**: Request handlers, loops, I/O operations
4. **Note data sizes**: Look for collection operations, database queries

**Critical**: Always read the **complete function/method body** to understand full context, not just the diff hunks.

## Step 3: Parse CONTEXT (if provided)

Extract performance expectations from `CONTEXT` parameter:

- **Latency goals**: p50/p95/p99 targets (e.g., "p95 < 200ms", "p99 < 500ms")
- **Throughput**: Requests/sec (e.g., "10k req/sec", "1M events/day")
- **Data sizes**: Typical workload (e.g., "1000 items/page", "10MB files", "1M users")
- **Concurrency**: Expected parallelism (e.g., "100 concurrent requests")
- **Resource constraints**: Memory, CPU limits (e.g., "512MB container")

Example:
```
CONTEXT: p95 < 200ms, 10k requests/sec, typical 1000 items/page, 512MB memory limit
```

## Step 4: Performance Checklist Review

For each changed function/class, systematically check:

### 4.1 Algorithmic Complexity
- [ ] What is the time complexity (Big-O)?
- [ ] Does complexity match expected workload?
- [ ] Nested loops over large collections?
- [ ] Unnecessary sorting or repeated computations?
- [ ] Linear search where hash lookup would work?
- [ ] Quadratic or worse algorithms for large inputs?

**Red flags:**
- O(n²) algorithm with n = 10,000+ items → minutes of execution
- Nested loops: `for (user of users) { for (order of orders) { ... } }` → O(n·m)
- Repeated sorting: Sort inside loop → O(n·m log m)
- `.filter().map().filter()` chains → multiple passes over data

### 4.2 Hot Path Analysis
- [ ] Is this function on the critical path (request handlers, event loops)?
- [ ] Tight loops that execute millions of times?
- [ ] Expensive operations in hot paths (regex, parsing, crypto)?
- [ ] Blocking operations in event loop (Node.js)?
- [ ] Cold start impact (lambdas, serverless)?

**Red flags:**
- Request handler performs O(n²) operation on every request
- Regex compilation inside loop (compile once, reuse)
- JSON.parse/stringify in tight loop
- Synchronous I/O in async context (blocks event loop)
- Heavy computation without caching

### 4.3 Database Performance
- [ ] **N+1 queries**: Loop fetching related data one-by-one?
- [ ] **Missing pagination**: Unbounded SELECT queries?
- [ ] **Full table scans**: Missing indexes for WHERE/JOIN columns?
- [ ] **SELECT \***: Fetching unnecessary columns?
- [ ] **Missing LIMIT**: Queries without row limits?
- [ ] **No query batching**: Multiple round-trips where one would suffice?

**Red flags:**
- `for (const user of users) { await getOrders(user.id) }` → N+1 query
- `SELECT * FROM orders` → millions of rows loaded into memory
- `WHERE email = ?` without index on email column
- Joining large tables without indexes

### 4.4 I/O and Concurrency
- [ ] Blocking I/O on event loop (Node.js)?
- [ ] Sequential I/O where parallel would work?
- [ ] Unbounded parallelism (Promise.all with huge array)?
- [ ] Missing backpressure (streams, queues)?
- [ ] Synchronous file operations in async code?
- [ ] No request coalescing for duplicate requests?

**Red flags:**
- `fs.readFileSync()` in request handler → blocks event loop
- `await` inside loop → sequential, should be parallel
- `Promise.all(millionItems.map(fetch))` → memory exhaustion
- No throttling on parallel operations

### 4.5 Memory Usage
- [ ] Loading entire datasets into memory?
- [ ] Large objects retained longer than needed?
- [ ] Unbounded caching (no size limits, no eviction)?
- [ ] Memory leaks (event listeners, closures, timers)?
- [ ] Large allocations in hot path?
- [ ] Streaming vs buffering for large payloads?

**Red flags:**
- `const allUsers = await db.query('SELECT * FROM users')` → OOM with 1M users
- Cache without eviction policy → unbounded growth
- `Buffer.from(largeString)` repeated allocations
- No streaming for file uploads/downloads

### 4.6 Serialization & Payloads
- [ ] Large response payloads (hundreds of KB+)?
- [ ] Redundant or unnecessary fields in responses?
- [ ] Missing compression (gzip, brotli)?
- [ ] Inefficient serialization formats (nested JSON)?
- [ ] Overfetching (GraphQL N+1, REST fetching unused data)?
- [ ] No pagination for list endpoints?

**Red flags:**
- API returns 10MB JSON response (should paginate)
- Including entire nested objects when IDs suffice
- No compression for large responses
- GraphQL resolvers with N+1 queries

### 4.7 Premature Optimization
- [ ] Complex caching/pooling without evidence of need?
- [ ] Micro-optimizations that obscure logic?
- [ ] Over-engineered performance infrastructure?
- [ ] Optimization before profiling?

**Call out premature optimization:**
- Adding Redis caching before measuring if it's slow
- Complex object pooling for small allocations
- Hand-rolled optimizations before profiling shows bottleneck

## Step 5: Generate Findings

For **each performance issue** found, create a finding with:

### Finding Format

```markdown
### PF-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**Performance Impact:**
- **Complexity:** O(?) → should be O(?)
- **Current:** [Measured or estimated latency/throughput]
- **Expected:** [Performance with typical workload from CONTEXT]
- **Degradation:** [How it scales with data size]

**Workload Analysis:**
```
Typical workload: [From CONTEXT or estimated]
- Input size: X items
- Current: Y seconds
- After fix: Z seconds (Nx improvement)
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (slow: O(...))
[current code]

// ✅ AFTER (fast: O(...))
[optimized code]
```

**Why This Fix:**
[Explain algorithmic improvement and expected performance gain]

**Benchmark (if applicable):**
```
Before: 1000 items → 5000ms
After:  1000 items → 50ms (100x faster)
```
```

### Severity Guidelines

- **BLOCKER**: Performance regression that makes feature unusable or violates hard requirements
  - Example: O(n²) algorithm with n=10k → 30+ seconds (timeout)
  - Example: Exceeds latency SLO by 10x (p95 2000ms vs 200ms target)
  - Example: OOM crash with typical workload

- **HIGH**: Significant performance degradation, poor user experience
  - Example: N+1 query with 100+ items → 5 seconds
  - Example: Violates latency SLO by 2-5x
  - Example: Unnecessary full table scan on hot path

- **MED**: Suboptimal performance, noticeable but acceptable
  - Example: Missing pagination (works but slow with large datasets)
  - Example: Sequential I/O where parallel would be better
  - Example: 2-3x slower than optimal

- **LOW**: Minor inefficiency, negligible user impact
  - Example: Slight algorithmic improvement (2ms → 1ms)
  - Example: Unnecessary work in cold path

- **NIT**: Stylistic or micro-optimization
  - Example: Could use `const` instead of `let` (negligible)

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with performance goals:

1. **Calculate if workload meets SLO**
   - Example: p95 < 200ms goal + O(n²) with n=1000 → 5000ms = BLOCKER

2. **Scale analysis with typical data sizes**
   - Example: "typical 1000 items/page" + no pagination = HIGH

3. **Throughput validation**
   - Example: "10k req/sec" + blocking I/O = BLOCKER

## Step 7: Performance Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** in production hot paths:

1. **O(n²) or worse** on request path with n > 1000
2. **N+1 queries** returning 100+ items
3. **Unbounded queries** (no LIMIT) on tables with 10k+ rows
4. **Blocking I/O** in async event loop (Node.js)
5. **OOM risk** (loading 100MB+ into memory)
6. **No pagination** for endpoints returning 1000+ items

## Step 8: Write Performance Report

Create `.claude/<SESSION_SLUG>/reviews/performance.md`:

```markdown
# Performance Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## Performance Profile

### Hot Paths Analyzed
- [✅/❌] Request handlers (latency critical)
- [✅/❌] Database queries (N+1, indexing)
- [✅/❌] Tight loops (algorithmic complexity)
- [✅/❌] I/O operations (blocking, parallelism)
- [✅/❌] Memory usage (unbounded allocations)
- [✅/❌] Serialization (payload sizes)

### Key Bottlenecks
[1-2 sentence summary of most critical performance issues]

### Estimated Impact
- **Current:** [Estimated latency/throughput]
- **After fixes:** [Projected improvement]

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - must fix before release]

### Short-term (HIGH)
[Actions for HIGH items - significant user impact]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - optimizations]

### Profiling Suggestions
[Recommend areas to profile for validation]

---

## Premature Optimizations (Avoid)

[List any premature optimizations found - remove these]

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide workload context I may have missed
```

## Step 9: Output Summary

Print to console:

```
🔍 Performance Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

📝 Full report: .claude/<SESSION_SLUG>/reviews/performance.md

⚠️  BLOCKER items: [list titles]

💡 Estimated improvement: [summary of projected gains]
```

---

## Example Findings

### Example 1: N+1 Query Pattern

```markdown
### PF-1: N+1 Query Loading User Orders [HIGH]

**Evidence:**
**File:** `src/api/users.ts:45`
```typescript
async function getUsersWithOrders() {
  // Query 1: Fetch all users
  const users = await db.query('SELECT * FROM users LIMIT 100');

  // Queries 2-101: Fetch orders for each user (N+1 problem)
  for (const user of users) {
    user.orders = await db.query(
      'SELECT * FROM orders WHERE user_id = $1',
      [user.id]
    );
  }

  return users;
}
```

**Performance Impact:**
- **Complexity:** O(n) queries → should be O(1)
- **Current:** 101 database round-trips (1 + 100 N+1)
- **Expected:** 2 database round-trips (1 for users, 1 for all orders)
- **Degradation:** Linear with number of users

**Workload Analysis:**
```
Typical workload: 100 users per page
- Current: 101 queries × 5ms = 505ms (just database time)
- After fix: 2 queries × 5ms = 10ms (50x faster)

With 1000 users:
- Current: 1001 queries × 5ms = 5,005ms (timeout)
- After fix: 2 queries × 8ms = 16ms (300x faster)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (N+1 queries: O(n) round-trips)
async function getUsersWithOrders() {
  const users = await db.query('SELECT * FROM users LIMIT 100');

  for (const user of users) {
    user.orders = await db.query(
      'SELECT * FROM orders WHERE user_id = $1',
      [user.id]
    );
  }

  return users;
}

// ✅ AFTER (2 queries: O(1) round-trips)
async function getUsersWithOrders() {
  // Query 1: Fetch users
  const users = await db.query('SELECT * FROM users LIMIT 100');

  if (users.length === 0) return users;

  // Query 2: Fetch ALL orders for these users in one query
  const userIds = users.map(u => u.id);
  const orders = await db.query(
    'SELECT * FROM orders WHERE user_id = ANY($1)',
    [userIds]
  );

  // Group orders by user_id (O(m) in-memory operation)
  const ordersByUser = orders.reduce((acc, order) => {
    if (!acc[order.user_id]) acc[order.user_id] = [];
    acc[order.user_id].push(order);
    return acc;
  }, {} as Record<string, Order[]>);

  // Attach orders to users (O(n) operation)
  for (const user of users) {
    user.orders = ordersByUser[user.id] || [];
  }

  return users;
}

// 🔥 BEST (single JOIN query: O(1) round-trip)
async function getUsersWithOrders() {
  const rows = await db.query(`
    SELECT
      u.id as user_id,
      u.name,
      u.email,
      o.id as order_id,
      o.amount,
      o.status,
      o.created_at
    FROM users u
    LEFT JOIN orders o ON u.id = o.user_id
    ORDER BY u.id
    LIMIT 100
  `);

  // Group rows into user objects with nested orders
  const usersMap = new Map<string, User>();

  for (const row of rows) {
    if (!usersMap.has(row.user_id)) {
      usersMap.set(row.user_id, {
        id: row.user_id,
        name: row.name,
        email: row.email,
        orders: []
      });
    }

    if (row.order_id) {
      usersMap.get(row.user_id)!.orders.push({
        id: row.order_id,
        amount: row.amount,
        status: row.status,
        created_at: row.created_at
      });
    }
  }

  return Array.from(usersMap.values());
}
```

**Why This Fix:**
- **Option 1 (2 queries)**: Eliminates N+1 by fetching all orders at once
  - 101 queries → 2 queries (50x fewer round-trips)
  - Simple to implement, works with all ORMs
  - Good when orders table has index on `user_id`

- **Option 2 (JOIN)**: Single query with JOIN
  - 101 queries → 1 query (100x fewer round-trips)
  - Most efficient (one round-trip)
  - Requires post-processing to group rows
  - Best performance for small to medium result sets

**Benchmark:**
```
Dataset: 100 users, 5 orders each (500 total orders)
Network latency: 5ms per query

Before (N+1):
- 101 queries × 5ms = 505ms

After (2 queries):
- 2 queries × 5ms = 10ms (50x faster)

After (1 JOIN):
- 1 query × 8ms = 8ms (63x faster)
```

**Index Required:**
```sql
-- Ensure index exists on orders.user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
```
```

### Example 2: Unbounded Query Without Pagination

```markdown
### PF-2: Unbounded Query Loads All Products into Memory [BLOCKER]

**Evidence:**
**File:** `src/api/products.ts:23`
```typescript
app.get('/api/products', async (req, res) => {
  // ❌ No LIMIT, no pagination - loads ALL products
  const products = await db.query('SELECT * FROM products');

  res.json(products);
});
```

**Performance Impact:**
- **Complexity:** O(n) memory usage, no upper bound
- **Current:** With 100k products → 50MB response, 2-3 seconds
- **Expected:** Should paginate, max 100 items per page
- **Degradation:** Linear memory growth, eventual OOM

**Workload Analysis:**
```
Current database: 10,000 products (500KB each row)
- Memory: 10,000 × 500 bytes = 5MB
- Latency: ~500ms
- Response size: 5MB JSON

In 1 year: 100,000 products
- Memory: 100,000 × 500 bytes = 50MB
- Latency: ~5 seconds
- Response size: 50MB JSON
- Risk: OOM crash, timeout

With pagination (100 items/page):
- Memory: 100 × 500 bytes = 50KB
- Latency: ~20ms
- Response size: 50KB JSON
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (unbounded query)
app.get('/api/products', async (req, res) => {
  const products = await db.query('SELECT * FROM products');
  res.json(products);
});

// ✅ AFTER (cursor-based pagination)
app.get('/api/products', async (req, res) => {
  // Parse pagination parameters
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100); // Max 100
  const cursor = req.query.cursor as string | undefined;

  let query: string;
  let params: any[];

  if (cursor) {
    // Cursor-based: Fetch items after cursor
    query = `
      SELECT id, name, price, created_at
      FROM products
      WHERE id > $1
      ORDER BY id ASC
      LIMIT $2
    `;
    params = [cursor, limit + 1]; // Fetch limit+1 to check if more exist
  } else {
    // First page
    query = `
      SELECT id, name, price, created_at
      FROM products
      ORDER BY id ASC
      LIMIT $1
    `;
    params = [limit + 1];
  }

  const products = await db.query(query, params);

  // Check if there are more items
  const hasMore = products.length > limit;
  if (hasMore) {
    products.pop(); // Remove extra item
  }

  // Next cursor is the last item's ID
  const nextCursor = hasMore ? products[products.length - 1].id : null;

  res.json({
    data: products,
    pagination: {
      limit,
      next_cursor: nextCursor,
      has_more: hasMore
    }
  });
});

// Alternative: Offset-based pagination (simpler, less efficient)
app.get('/api/products', async (req, res) => {
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
  const offset = (page - 1) * limit;

  // Count total (cache this query for 5 minutes)
  const countResult = await db.query('SELECT COUNT(*) FROM products');
  const total = parseInt(countResult.rows[0].count);

  // Fetch page
  const products = await db.query(
    `SELECT id, name, price, created_at
     FROM products
     ORDER BY id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({
    data: products,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      has_more: offset + limit < total
    }
  });
});
```

**Why This Fix:**
- **Cursor-based pagination**: Efficient for large datasets
  - No OFFSET scan (always fast, even on page 1000)
  - Stateless (cursor encodes position)
  - Handles real-time inserts gracefully
  - Requires indexed column for cursor (e.g., `id` or `created_at`)

- **Offset-based pagination**: Simpler, less efficient
  - Easy to implement, familiar to clients
  - OFFSET becomes slow for large offsets (OFFSET 100000 → slow)
  - Can have consistency issues with concurrent inserts
  - Better for small datasets or admin panels

**Performance Comparison:**
```
Dataset: 100,000 products

Unbounded query:
- Memory: 50MB
- Latency: 5,000ms
- Response: 50MB

Cursor pagination (page 1):
- Memory: 50KB
- Latency: 20ms
- Response: 50KB

Cursor pagination (page 1000):
- Memory: 50KB
- Latency: 20ms (still fast)
- Response: 50KB

Offset pagination (page 1000):
- Memory: 50KB
- Latency: 500ms (scans first 100k rows)
- Response: 50KB
```

**Index Required:**
```sql
-- Cursor pagination requires index on cursor column
CREATE INDEX IF NOT EXISTS idx_products_id ON products(id);

-- Or use created_at for chronological pagination
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);
```
```

### Example 3: O(n²) Algorithm in Hot Path

```markdown
### PF-3: Quadratic Time Complexity Finding Duplicates [BLOCKER]

**Evidence:**
**File:** `src/services/deduplication.ts:67`
```typescript
function findDuplicates(items: Item[]): Item[] {
  const duplicates: Item[] = [];

  // ❌ O(n²) nested loop - compares every item with every other item
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].email === items[j].email) {
        duplicates.push(items[j]);
      }
    }
  }

  return duplicates;
}
```

**Performance Impact:**
- **Complexity:** O(n²) → should be O(n)
- **Current:** With 10,000 items → 50M comparisons → 30+ seconds
- **Expected:** With 10,000 items → 10k lookups → 50ms
- **Degradation:** Quadratic - doubles data → 4x slower

**Workload Analysis:**
```
n=100 items:
- Comparisons: 100² = 10,000
- Time: ~5ms

n=1,000 items:
- Comparisons: 1,000² = 1,000,000
- Time: ~500ms

n=10,000 items:
- Comparisons: 10,000² = 100,000,000
- Time: ~30,000ms (30 seconds - TIMEOUT)

With O(n) hash-based approach:
n=10,000 items:
- Lookups: 10,000
- Time: ~50ms (600x faster)
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (O(n²) nested loop)
function findDuplicates(items: Item[]): Item[] {
  const duplicates: Item[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].email === items[j].email) {
        duplicates.push(items[j]);
      }
    }
  }

  return duplicates;
}

// ✅ AFTER (O(n) hash map)
function findDuplicates(items: Item[]): Item[] {
  const seen = new Map<string, Item>();
  const duplicates: Item[] = [];

  for (const item of items) {
    const existing = seen.get(item.email);

    if (existing) {
      // Found duplicate
      duplicates.push(item);
    } else {
      // First occurrence
      seen.set(item.email, item);
    }
  }

  return duplicates;
}

// Alternative: Return all duplicates (including first occurrence)
function findAllDuplicates(items: Item[]): Item[] {
  const emailCounts = new Map<string, Item[]>();

  // Group by email (O(n))
  for (const item of items) {
    if (!emailCounts.has(item.email)) {
      emailCounts.set(item.email, []);
    }
    emailCounts.get(item.email)!.push(item);
  }

  // Collect duplicates (O(n))
  const duplicates: Item[] = [];
  for (const [email, group] of emailCounts) {
    if (group.length > 1) {
      duplicates.push(...group);
    }
  }

  return duplicates;
}
```

**Why This Fix:**
- **Hash map lookup**: O(1) average case vs O(n) linear search
- **Single pass**: One loop instead of nested loops
- **Memory trade-off**: Uses O(n) memory for hash map (acceptable)
- **Scalability**: Linear scaling instead of quadratic

**Benchmark:**
```
n=100:
- Before: 10,000 comparisons → 5ms
- After: 100 lookups → 0.5ms (10x faster)

n=1,000:
- Before: 1,000,000 comparisons → 500ms
- After: 1,000 lookups → 5ms (100x faster)

n=10,000:
- Before: 100,000,000 comparisons → 30,000ms
- After: 10,000 lookups → 50ms (600x faster)

n=100,000:
- Before: 10,000,000,000 comparisons → TIMEOUT
- After: 100,000 lookups → 500ms
```

**Algorithmic Improvement:**
- **Time complexity**: O(n²) → O(n)
- **Space complexity**: O(1) → O(n) (acceptable for 10k items)
- **Scalability**: Now handles 100k+ items in reasonable time
```

### Example 4: Blocking I/O in Event Loop

```markdown
### PF-4: Synchronous File Read Blocks Event Loop [BLOCKER]

**Evidence:**
**File:** `src/api/files.ts:34`
```typescript
app.get('/api/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const filePath = path.join(UPLOAD_DIR, fileId);

  // ❌ Synchronous read blocks event loop
  const content = fs.readFileSync(filePath, 'utf8');

  res.json({ content });
});
```

**Performance Impact:**
- **Complexity:** Blocking operation in async context
- **Current:** 100ms file read blocks ALL requests for 100ms
- **Expected:** Async I/O, event loop never blocked
- **Degradation:** Linear with concurrent requests

**Workload Analysis:**
```
Single request:
- File size: 1MB
- Read time: 100ms (sync or async, same)
- User sees: 100ms latency

10 concurrent requests (CONTEXT: 10k req/sec):
- With sync: 10 × 100ms = 1000ms (serial, blocking)
- With async: max(100ms) = 100ms (parallel, non-blocking)

100 concurrent requests:
- With sync: 100 × 100ms = 10,000ms (10 seconds)
- With async: max(100ms) = 100ms

Event loop blocked:
- During 100ms file read, NO OTHER REQUESTS are processed
- Health check endpoint: BLOCKED
- Metrics endpoint: BLOCKED
- All endpoints: BLOCKED (even simple ones)
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (blocks event loop)
app.get('/api/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const filePath = path.join(UPLOAD_DIR, fileId);

  // Blocks event loop for entire read duration
  const content = fs.readFileSync(filePath, 'utf8');

  res.json({ content });
});

// ✅ AFTER (async I/O, non-blocking)
app.get('/api/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const filePath = path.join(UPLOAD_DIR, fileId);

  // Non-blocking async read
  const content = await fs.promises.readFile(filePath, 'utf8');

  res.json({ content });
});

// 🔥 BEST (streaming for large files)
app.get('/api/files/:id', async (req, res) => {
  const fileId = req.params.id;
  const filePath = path.join(UPLOAD_DIR, fileId);

  // Stream file (even better for large files, constant memory)
  const stat = await fs.promises.stat(filePath);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Type', 'text/plain');

  const readStream = fs.createReadStream(filePath, 'utf8');
  readStream.pipe(res);

  readStream.on('error', (err) => {
    console.error('Stream error', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to read file' });
    }
  });
});
```

**Why This Fix:**
- **Async I/O**: Releases event loop while waiting for I/O
  - Other requests can be processed during file read
  - No blocking, maintains throughput
  - Essential for Node.js performance

- **Streaming**: Best for large files
  - Constant memory usage (no buffering entire file)
  - Start sending response immediately (lower TTFB)
  - Backpressure handling (pause if client slow)

**Performance Comparison:**
```
Scenario: 100 concurrent requests, 1MB files, 100ms read time

With fs.readFileSync (blocking):
- Event loop blocked 100 times × 100ms = 10,000ms total blocked
- Throughput: 10 req/sec (serial)
- p95 latency: 9,500ms
- All requests queued (even fast ones)

With fs.promises.readFile (async):
- Event loop never blocked
- Throughput: 100 req/sec (limited by I/O)
- p95 latency: 150ms
- Other endpoints remain responsive

With streaming:
- Event loop never blocked
- Constant memory (16KB chunks vs 1MB buffered)
- Lower TTFB (start sending immediately)
- Handles multi-GB files without OOM
```

**Other Blocking Operations to Avoid:**
```typescript
// ❌ Blocking operations in Node.js
fs.readFileSync()
fs.writeFileSync()
child_process.execSync()
crypto.pbkdf2Sync()

// ✅ Use async alternatives
await fs.promises.readFile()
await fs.promises.writeFile()
child_process.exec() + promisify
await crypto.pbkdf2() + promisify
```
```

### Example 5: Unbounded Parallelism (Memory Exhaustion)

```markdown
### PF-5: Promise.all with Million Items Causes OOM [HIGH]

**Evidence:**
**File:** `src/services/import.ts:89`
```typescript
async function importUsers(userIds: string[]) {
  // ❌ Unbounded parallelism - creates 1M promises at once
  const users = await Promise.all(
    userIds.map(id => fetchUserFromAPI(id))
  );

  await db.insertMany(users);
}
```

**Performance Impact:**
- **Complexity:** O(n) memory usage, no upper bound
- **Current:** With 1M user IDs → OOM crash
- **Expected:** Batch processing with concurrency limit
- **Degradation:** Linear memory growth, eventual OOM

**Workload Analysis:**
```
Workload: 1,000,000 user IDs (typical import job)

With Promise.all (unbounded):
- Concurrent requests: 1,000,000
- Memory per request: 10KB (request + response buffering)
- Total memory: 10,000,000 KB = 10GB
- Result: OOM crash (container has 512MB limit)

With batching (concurrency=100):
- Concurrent requests: 100 (max)
- Memory per request: 10KB
- Total memory: 1,000 KB = 1MB
- Result: Success, takes longer but stable
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (unbounded parallelism)
async function importUsers(userIds: string[]) {
  // Creates ALL promises at once (1M concurrent requests)
  const users = await Promise.all(
    userIds.map(id => fetchUserFromAPI(id))
  );

  await db.insertMany(users);
}

// ✅ AFTER (bounded concurrency with p-limit)
import pLimit from 'p-limit';

async function importUsers(userIds: string[]) {
  const limit = pLimit(100); // Max 100 concurrent requests

  // Process in batches with concurrency limit
  const users = await Promise.all(
    userIds.map(id => limit(() => fetchUserFromAPI(id)))
  );

  // Insert in batches (avoid huge single insert)
  const BATCH_SIZE = 1000;
  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await db.insertMany(batch);
  }
}

// Alternative: Manual batching (no dependency)
async function importUsers(userIds: string[]) {
  const BATCH_SIZE = 100;
  const results: User[] = [];

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);

    // Process batch concurrently
    const batchResults = await Promise.all(
      batch.map(id => fetchUserFromAPI(id))
    );

    results.push(...batchResults);

    // Insert batch immediately (stream results, don't buffer all in memory)
    await db.insertMany(batchResults);

    console.log(`Processed ${i + batch.length}/${userIds.length} users`);
  }

  return results;
}

// 🔥 BEST (streaming with backpressure)
import { pipeline } from 'stream/promises';
import { Readable, Transform, Writable } from 'stream';

async function importUsersStreaming(userIds: string[]) {
  const CONCURRENCY = 100;

  // Source: Stream of user IDs
  const sourceStream = Readable.from(userIds);

  // Transform: Fetch user from API (with concurrency limit)
  const fetchTransform = new Transform({
    objectMode: true,
    highWaterMark: CONCURRENCY,
    async transform(userId: string, encoding, callback) {
      try {
        const user = await fetchUserFromAPI(userId);
        callback(null, user);
      } catch (err) {
        callback(err);
      }
    }
  });

  // Sink: Insert into database (batched)
  let batch: User[] = [];
  const BATCH_SIZE = 1000;

  const insertSink = new Writable({
    objectMode: true,
    async write(user: User, encoding, callback) {
      batch.push(user);

      if (batch.length >= BATCH_SIZE) {
        try {
          await db.insertMany(batch);
          console.log(`Inserted batch of ${batch.length} users`);
          batch = [];
          callback();
        } catch (err) {
          callback(err);
        }
      } else {
        callback();
      }
    },
    async final(callback) {
      // Flush remaining batch
      if (batch.length > 0) {
        try {
          await db.insertMany(batch);
          console.log(`Inserted final batch of ${batch.length} users`);
          callback();
        } catch (err) {
          callback(err);
        }
      } else {
        callback();
      }
    }
  });

  // Pipeline with backpressure
  await pipeline(sourceStream, fetchTransform, insertSink);
}
```

**Why This Fix:**
- **Bounded concurrency**: Max 100 requests at once (not 1M)
  - Prevents memory exhaustion
  - Respects API rate limits
  - Steady-state memory usage

- **Manual batching**: Simple, no dependencies
  - Process in chunks of 100
  - Predictable memory usage
  - Easy to add progress logging

- **Streaming**: Best for very large datasets
  - Constant memory (processes one item at a time)
  - Backpressure handling (pause if consumer slow)
  - Most memory efficient

**Performance Comparison:**
```
Dataset: 1,000,000 user IDs

Unbounded Promise.all:
- Memory: 10GB (1M × 10KB)
- Result: OOM crash
- Time: N/A (crashes)

Bounded concurrency (p-limit):
- Memory: 1MB (100 × 10KB)
- Time: 1,000,000 / 100 = 10,000 batches × 100ms = 1,000 seconds (~16 minutes)
- Result: Success

Manual batching (100 per batch):
- Memory: 1MB (100 × 10KB)
- Time: ~16 minutes (same as p-limit)
- Result: Success

Streaming:
- Memory: 10KB (1 item at a time)
- Time: ~16 minutes (same throughput)
- Result: Success, most memory efficient
```

**Throughput Analysis:**
```
API rate limit: 1000 requests/second

Unbounded (if it worked):
- Would hit rate limit immediately
- Likely get rate limited, banned

Bounded (100 concurrency):
- Respects rate limits
- Sustainable throughput
- 100 req/sec (well under limit)
```
```

### Example 6: Missing Database Index

```markdown
### PF-6: Full Table Scan on User Lookup [HIGH]

**Evidence:**
**File:** `src/api/auth.ts:56`
```typescript
async function loginUser(email: string, password: string) {
  // ❌ No index on email column → full table scan
  const user = await db.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    throw new Error('User not found');
  }

  // Verify password...
}
```

**Performance Impact:**
- **Complexity:** O(n) full table scan → should be O(log n) with index
- **Current:** With 1M users → 2000ms query time
- **Expected:** With index → 5ms query time
- **Degradation:** Linear with table size

**Workload Analysis:**
```
Database: 1,000 users
- Without index: Sequential scan of 1,000 rows → 10ms
- With index: B-tree lookup → 2ms (5x faster)

Database: 100,000 users
- Without index: Sequential scan of 100,000 rows → 500ms
- With index: B-tree lookup → 3ms (166x faster)

Database: 1,000,000 users
- Without index: Sequential scan of 1,000,000 rows → 2000ms
- With index: B-tree lookup → 5ms (400x faster)

Load: 100 logins/second
- Without index: 100 × 2000ms = 200 seconds of DB time per second (impossible)
- With index: 100 × 5ms = 500ms of DB time per second (sustainable)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```sql
-- Check if index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users'
  AND indexdef LIKE '%email%';

-- ✅ Create index on email column
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- For case-insensitive email lookups (if using ILIKE)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- Verify index is used
EXPLAIN ANALYZE
SELECT * FROM users WHERE email = 'user@example.com';
-- Should show "Index Scan using idx_users_email" (not "Seq Scan")
```

**Application Code (unchanged):**
```typescript
// No code changes needed - query optimizer uses index automatically
async function loginUser(email: string, password: string) {
  const user = await db.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    throw new Error('User not found');
  }

  // Verify password...
}
```

**Why This Fix:**
- **B-tree index**: O(log n) lookups instead of O(n) scan
- **Query optimizer**: Database automatically uses index
- **Read performance**: 100-400x faster for large tables
- **Write overhead**: Minimal (index updated on INSERT/UPDATE)

**EXPLAIN ANALYZE Output:**
```sql
-- ❌ Before (no index):
Seq Scan on users  (cost=0.00..25000.00 rows=1 width=100) (actual time=1500.123..2000.456 rows=1 loops=1)
  Filter: (email = 'user@example.com')
  Rows Removed by Filter: 999999
Planning Time: 0.123 ms
Execution Time: 2000.789 ms

-- ✅ After (with index):
Index Scan using idx_users_email on users  (cost=0.42..8.44 rows=1 width=100) (actual time=0.123..0.125 rows=1 loops=1)
  Index Cond: (email = 'user@example.com')
Planning Time: 0.234 ms
Execution Time: 0.256 ms
```

**Other Columns to Index:**
```sql
-- Identify columns used in WHERE clauses, JOIN conditions, ORDER BY
-- Review query logs for slow queries

-- Common indexes for users table:
CREATE INDEX idx_users_email ON users(email);              -- Login lookups
CREATE INDEX idx_users_username ON users(username);        -- Username lookups
CREATE INDEX idx_users_created_at ON users(created_at);    -- Chronological queries

-- Composite index for multi-column queries
CREATE INDEX idx_users_status_created ON users(status, created_at DESC);

-- orders table:
CREATE INDEX idx_orders_user_id ON orders(user_id);        -- JOIN with users
CREATE INDEX idx_orders_status ON orders(status);           -- Filter by status
CREATE INDEX idx_orders_created_at ON orders(created_at DESC); -- Recent orders
```
```

### Example 7: Large Response Payload Without Pagination

```markdown
### PF-7: API Returns 10MB Response (No Pagination) [MED]

**Evidence:**
**File:** `src/api/orders.ts:45`
```typescript
app.get('/api/users/:userId/orders', async (req, res) => {
  const userId = req.params.userId;

  // ❌ Returns ALL orders, no pagination
  const orders = await db.query(
    `SELECT o.*, oi.*
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );

  res.json(orders);
});
```

**Performance Impact:**
- **Complexity:** O(n) response size, no upper bound
- **Current:** Power user with 1000 orders → 10MB response, 5s latency
- **Expected:** Paginate, max 50 orders per page → 500KB, 200ms
- **Degradation:** Linear with order count

**Workload Analysis:**
```
Average user: 10 orders
- Response size: 10 × 10KB = 100KB
- Latency: 150ms (acceptable)

Power user: 1,000 orders
- Response size: 1,000 × 10KB = 10MB
- Latency: 5,000ms
- Mobile network: 10MB / 5 Mbps = 16 seconds download

With pagination (50 orders/page):
Power user, first page:
- Response size: 50 × 10KB = 500KB (20x smaller)
- Latency: 200ms (25x faster)
- Mobile: 500KB / 5 Mbps = 0.8 seconds (20x faster)
```

**Severity:** MED
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (unbounded response)
app.get('/api/users/:userId/orders', async (req, res) => {
  const userId = req.params.userId;

  const orders = await db.query(
    `SELECT o.*, oi.*
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [userId]
  );

  res.json(orders);
});

// ✅ AFTER (pagination + field selection)
app.get('/api/users/:userId/orders', async (req, res) => {
  const userId = req.params.userId;
  const page = Math.max(parseInt(req.query.page as string) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100
  const offset = (page - 1) * limit;

  // Fetch only needed fields (not SELECT *)
  const orders = await db.query(
    `SELECT
       o.id,
       o.total_amount,
       o.status,
       o.created_at,
       COUNT(oi.id) as item_count
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.user_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  // Get total count (cache for 5 minutes)
  const countResult = await db.query(
    'SELECT COUNT(*) FROM orders WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countResult.rows[0].count);

  res.json({
    data: orders,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  });
});

// If user requests full order details, separate endpoint
app.get('/api/orders/:orderId', async (req, res) => {
  const orderId = req.params.orderId;

  const order = await db.query(
    `SELECT
       o.*,
       json_agg(
         json_build_object(
           'id', oi.id,
           'product_id', oi.product_id,
           'quantity', oi.quantity,
           'price', oi.price
         )
       ) as items
     FROM orders o
     LEFT JOIN order_items oi ON o.id = oi.order_id
     WHERE o.id = $1
     GROUP BY o.id`,
    [orderId]
  );

  res.json(order);
});
```

**Why This Fix:**
- **Pagination**: Limit response size to 50-100 orders
  - Reduces payload by 20x for power users
  - Faster serialization, transmission, parsing
  - Better mobile UX

- **Field selection**: Only return needed fields
  - Avoid `SELECT *` (fetches unnecessary columns)
  - Aggregate item count instead of full items
  - Use separate endpoint for full order details

- **Response structure**: Summary vs detail endpoints
  - List endpoint: Summary view (fast)
  - Detail endpoint: Full data (slower, but on-demand)

**Performance Comparison:**
```
Power user with 1,000 orders:

Before (no pagination):
- Database: SELECT 1,000 orders + 5,000 items → 500ms
- Serialization: 10MB JSON → 500ms
- Network: 10MB / 5 Mbps → 16,000ms
- Client parsing: 10MB JSON → 1,000ms
- Total: ~18 seconds

After (pagination, first page):
- Database: SELECT 50 orders + aggregate counts → 50ms
- Serialization: 500KB JSON → 50ms
- Network: 500KB / 5 Mbps → 800ms
- Client parsing: 500KB JSON → 50ms
- Total: ~1 second (18x faster)
```

**Additional Optimization:**
```typescript
// Enable gzip compression for JSON responses
import compression from 'compression';
app.use(compression());

// 500KB JSON → 50KB gzipped (10x compression)
// Network time: 50KB / 5 Mbps = 80ms (10x faster)
```
```

---

## Notes

- **Read full function context**: Always read the entire function/method, not just diff lines
- **Concrete workload analysis**: Show real numbers from CONTEXT or estimate typical workloads
- **Big-O analysis**: State current and optimal complexity
- **Benchmark estimates**: Provide before/after performance estimates
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after code
- **Cross-reference CONTEXT**: Prioritize findings based on SLOs and workload
- **Call out premature optimization**: Flag over-engineering without evidence
- **False positives welcome**: Encourage users to challenge findings
