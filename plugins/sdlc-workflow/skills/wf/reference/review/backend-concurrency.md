---
description: "Review backend code for race conditions, atomicity violations, locking issues, and idempotency bugs"
argument-hint: "[scope] [target] [paths]"
args:
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target to review
    required: false
  PATHS:
    description: Optional file path globs to focus review (e.g., "src/services/**/*.ts")
    required: false
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# ROLE
You are a backend concurrency reviewer. You hunt for **race conditions**, **atomicity violations**, **deadlocks**, and **idempotency bugs** that cause data corruption under concurrent load. You focus on the "works in dev, breaks in production" class of bugs.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line-range` + vulnerable code snippet
2. **Race scenario**: Show concrete interleaving that causes failure
3. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
4. **Concurrency pattern**: Identify specific pattern (check-then-act, read-modify-write, etc.)
5. **Fix with code**: Provide thread-safe alternative

# CONCURRENCY NON-NEGOTIABLES (BLOCKER if violated)

These are **BLOCKER** severity - cause data corruption or system failure:

1. **Data races on shared state** (unsynchronized reads/writes)
2. **Atomicity violations** (check-then-act, read-modify-write without locks)
3. **Lost updates** (concurrent writes clobber each other)
4. **Non-idempotent operations** (retry causes duplicates/corruption)
5. **Deadlocks** (circular lock dependencies)
6. **Double-spend** (balance check-then-deduct race)
7. **Phantom reads** (transaction isolation violation)

# PRIMARY QUESTIONS

1. **What happens if two requests execute this code simultaneously?**
2. **Is this operation atomic? Or can it be interleaved?**
3. **What if this request is retried (network timeout, crash)?**
4. **Can two transactions deadlock on these locks?**
5. **Is the transaction isolation level sufficient?**

# CONCURRENCY FAILURE MODES

## Classic Race Conditions

### Check-Then-Act (TOCTOU)
```python
# Thread 1 and Thread 2 both check
if balance >= amount:  # Both see balance = 100
    # Thread 1 deducts
    balance -= 50  # balance = 50
    # Thread 2 deducts
    balance -= 80  # balance = -30 ❌ (overdraft!)
```

### Read-Modify-Write
```javascript
// Thread 1 and Thread 2 both read
const count = await getCount();  // Both see count = 5
// Thread 1 writes
await setCount(count + 1);  // count = 6
// Thread 2 writes
await setCount(count + 1);  // count = 6 ❌ (lost update!)
```

### Lost Update
```sql
-- Session 1 and Session 2 both read
SELECT balance FROM accounts WHERE id = 123;  -- Both see 100

-- Session 1 updates
UPDATE accounts SET balance = 100 - 50 WHERE id = 123;  -- balance = 50

-- Session 2 updates (overwrites Session 1's update)
UPDATE accounts SET balance = 100 - 30 WHERE id = 123;  -- balance = 70 ❌
```

### Double-Spend
```typescript
// Request 1 and Request 2 both check
if (user.credits >= price) {  // Both see credits = 10
    // Request 1 deducts
    user.credits -= 10;  // credits = 0
    await user.save();

    // Request 2 deducts (credits already 0!)
    user.credits -= 10;  // credits = -10 ❌
    await user.save();
}
```

# DO THIS FIRST

Before scanning for concurrency issues:

1. **Identify concurrency model**:
   - Single-threaded (Node.js event loop, Python asyncio)
   - Multi-threaded (Java, Go, Python threads)
   - Multi-process (workers, job queues)
   - Distributed (microservices, serverless)

2. **Identify shared state**:
   - Database records (concurrent updates)
   - Cache (Redis, Memcached)
   - In-memory state (globals, singletons)
   - Filesystem (concurrent writes)
   - External APIs (rate limits, idempotency)

3. **Identify critical sections**:
   - Money operations (payments, transfers, refunds)
   - Inventory management (stock updates)
   - User actions (likes, follows, votes)
   - Sequence generation (IDs, order numbers)
   - Rate limiting (quota checks)

4. **Understand database**:
   - Database type (PostgreSQL, MySQL, MongoDB)
   - Transaction isolation level (READ COMMITTED, REPEATABLE READ, SERIALIZABLE)
   - Locking strategy (row locks, table locks, optimistic locking)
   - Constraints (unique, foreign keys)

# BACKEND CONCURRENCY CHECKLIST

## 1. Shared State & Data Races

**Red flags:**
- Global variables modified by requests
- Singleton instances with mutable state
- Cache reads/writes without locks
- In-memory counters/maps updated concurrently
- File writes without locking

**Concurrency patterns:**
- Unsynchronized read/write (data race)
- Non-atomic increment (lost update)
- Cache stampede (thundering herd)

**Code examples:**

### Bad: Unsynchronized counter
```typescript
// ❌ BLOCKER: Data race on global counter
let requestCount = 0;

app.get('/api/metrics', (req, res) => {
  requestCount++;  // Multiple requests increment simultaneously
  res.json({ requests: requestCount });
});

// Request 1: reads 0, writes 1
// Request 2: reads 0, writes 1 (lost update!)
// Actual: 2 requests, counter shows 1
```

### Good: Atomic counter
```typescript
// ✅ Thread-safe: Atomic increment
import { AtomicCounter } from './atomic';

const requestCount = new AtomicCounter();

app.get('/api/metrics', (req, res) => {
  requestCount.increment();  // Atomic operation
  res.json({ requests: requestCount.get() });
});

// Or use database for persistence
app.get('/api/metrics', async (req, res) => {
  await db.query('UPDATE metrics SET requests = requests + 1');
  const { requests } = await db.query('SELECT requests FROM metrics');
  res.json({ requests });
});
```

### Bad: Cache stampede
```typescript
// ❌ HIGH: Multiple requests fetch same data simultaneously
async function getUser(userId: string): Promise<User> {
  const cached = cache.get(userId);
  if (cached) return cached;

  // 100 requests miss cache simultaneously
  const user = await db.users.findById(userId);  // 100 DB queries!
  cache.set(userId, user);
  return user;
}
```

### Good: Cache with lock
```typescript
// ✅ Prevent stampede: Lock while fetching
import { Mutex } from 'async-mutex';

const fetchLocks = new Map<string, Mutex>();

async function getUser(userId: string): Promise<User> {
  const cached = cache.get(userId);
  if (cached) return cached;

  // Get or create mutex for this user
  if (!fetchLocks.has(userId)) {
    fetchLocks.set(userId, new Mutex());
  }
  const mutex = fetchLocks.get(userId)!;

  // Only one request fetches, others wait
  return await mutex.runExclusive(async () => {
    // Double-check after acquiring lock
    const cached = cache.get(userId);
    if (cached) return cached;

    const user = await db.users.findById(userId);
    cache.set(userId, user);
    return user;
  });
}
```

## 2. Atomicity Violations

**Red flags:**
- Check-then-act without transaction
- Read-modify-write without lock
- Multiple statements that must be atomic
- Missing database transactions
- Incorrect transaction boundaries

**Concurrency patterns:**
- Check-then-act (TOCTOU)
- Read-modify-write
- Non-atomic multi-step operations

**Code examples:**

### Bad: Check-then-act race (double-spend)
```typescript
// ❌ BLOCKER: Classic double-spend bug
async function purchaseItem(userId: string, itemId: string, price: number) {
  const user = await db.users.findById(userId);

  // Check balance
  if (user.balance < price) {
    throw new Error('Insufficient balance');
  }

  // Deduct balance (separate query!)
  user.balance -= price;
  await db.users.update(userId, { balance: user.balance });

  // Create purchase
  await db.purchases.insert({ userId, itemId, price });
}

// Request 1: checks balance (100), passes
// Request 2: checks balance (100), passes
// Request 1: deducts 80 (balance = 20)
// Request 2: deducts 60 (balance = -40) ❌ Overdraft!
```

### Good: Atomic check-and-deduct
```typescript
// ✅ Atomic: Use database transaction with lock
async function purchaseItem(userId: string, itemId: string, price: number) {
  await db.transaction(async (tx) => {
    // Lock row for update
    const user = await tx.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );

    if (user.balance < price) {
      throw new Error('Insufficient balance');
    }

    // Deduct atomically (within same transaction)
    await tx.query(
      'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
      [price, userId]
    );

    // Check affected rows (handles race condition)
    if (tx.rowCount === 0) {
      throw new Error('Insufficient balance');
    }

    await tx.query(
      'INSERT INTO purchases (user_id, item_id, price) VALUES ($1, $2, $3)',
      [userId, itemId, price]
    );
  });
}
```

### Bad: Read-modify-write without lock
```python
# ❌ BLOCKER: Lost update bug
async def increment_counter(key: str):
    # Read
    counter = await redis.get(key)
    value = int(counter) if counter else 0

    # Modify
    value += 1

    # Write (can be interleaved!)
    await redis.set(key, value)

# Thread 1: reads 5
# Thread 2: reads 5
# Thread 1: writes 6
# Thread 2: writes 6 (lost Thread 1's increment!)
```

### Good: Atomic increment
```python
# ✅ Atomic: Use Redis INCR command
async def increment_counter(key: str):
    # Atomic increment
    return await redis.incr(key)

# Or for more complex operations, use Lua script
lua_script = """
local current = redis.call('GET', KEYS[1])
local value = tonumber(current) or 0
local new_value = value + ARGV[1]
redis.call('SET', KEYS[1], new_value)
return new_value
"""

async def increment_counter(key: str, amount: int):
    return await redis.eval(lua_script, 1, key, amount)
```

## 3. Transaction Isolation Issues

**Red flags:**
- Missing transaction wrappers
- Wrong isolation level (READ UNCOMMITTED, READ COMMITTED for critical ops)
- Phantom reads (row appears/disappears mid-transaction)
- Non-repeatable reads (row changes mid-transaction)
- Long-running transactions (high lock contention)

**Concurrency patterns:**
- Phantom reads
- Non-repeatable reads
- Write skew

**Code examples:**

### Bad: Missing transaction
```typescript
// ❌ HIGH: Non-atomic transfer (money can be lost!)
async function transferMoney(fromId: string, toId: string, amount: number) {
  // Deduct from sender
  await db.query(
    'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
    [amount, fromId]
  );

  // Crash here = money disappears! ❌

  // Add to recipient
  await db.query(
    'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
    [amount, toId]
  );
}
```

### Good: Transactional transfer
```typescript
// ✅ Atomic: Transaction ensures all-or-nothing
async function transferMoney(fromId: string, toId: string, amount: number) {
  await db.transaction(async (tx) => {
    // Both updates in same transaction
    await tx.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1',
      [amount, fromId]
    );

    if (tx.rowCount === 0) {
      throw new Error('Insufficient balance');
    }

    await tx.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, toId]
    );

    // Commit atomically (both succeed or both fail)
  });
}
```

### Bad: Wrong isolation level (phantom read)
```python
# ❌ HIGH: Phantom read allows duplicate booking
async def book_seat(show_id: int, user_id: int):
    # Check available seats (READ COMMITTED isolation)
    result = await db.query(
        "SELECT COUNT(*) FROM bookings WHERE show_id = $1",
        [show_id]
    )
    booked = result[0]["count"]

    if booked >= MAX_SEATS:
        raise Exception("Show full")

    # Another transaction inserts here!

    # Book seat
    await db.query(
        "INSERT INTO bookings (show_id, user_id) VALUES ($1, $2)",
        [show_id, user_id]
    )

# Transaction 1: sees 99 bookings, proceeds
# Transaction 2: sees 99 bookings, proceeds
# Both insert = 101 bookings (oversold!)
```

### Good: Correct isolation level or lock
```python
# ✅ Prevent phantom: Use SERIALIZABLE or lock
async def book_seat(show_id: int, user_id: int):
    async with db.transaction(isolation="SERIALIZABLE"):
        # Count with lock
        result = await db.query(
            "SELECT COUNT(*) FROM bookings WHERE show_id = $1 FOR UPDATE",
            [show_id]
        )
        booked = result[0]["count"]

        if booked >= MAX_SEATS:
            raise Exception("Show full")

        await db.query(
            "INSERT INTO bookings (show_id, user_id) VALUES ($1, $2)",
            [show_id, user_id]
        )

# Or use database constraint
# CREATE UNIQUE INDEX unique_booking ON bookings (show_id, seat_number);
# INSERT fails if seat already booked
```

## 4. Async/Await Correctness

**Red flags:**
- Missing `await` on async operations
- Unhandled promise rejections
- Race conditions in async chains
- Concurrent mutations via `Promise.all`
- Fire-and-forget async calls

**Concurrency patterns:**
- Forgotten await
- Unhandled rejections
- Concurrent mutations

**Code examples:**

### Bad: Missing await
```typescript
// ❌ BLOCKER: Missing await causes race condition
async function createUser(email: string, name: string) {
  // Forgot await! Returns before insert completes
  db.users.insert({ email, name });  // ❌ Missing await

  // Sends email before user exists in DB!
  await sendWelcomeEmail(email);

  return { success: true };
}

// User gets email, but record not in DB yet
// Later queries fail (user doesn't exist)
```

### Good: Proper await
```typescript
// ✅ Correct: Await ensures order
async function createUser(email: string, name: string) {
  // Wait for insert to complete
  const user = await db.users.insert({ email, name });

  // Only send email after user exists
  await sendWelcomeEmail(email);

  return user;
}
```

### Bad: Concurrent mutations
```typescript
// ❌ HIGH: Promise.all allows concurrent mutations
async function updateBalances(transactions: Transaction[]) {
  await Promise.all(
    transactions.map(async (tx) => {
      const user = await db.users.findById(tx.userId);
      user.balance += tx.amount;
      await db.users.update(tx.userId, { balance: user.balance });
    })
  );
}

// Transaction 1: reads balance (100)
// Transaction 2: reads balance (100)
// Transaction 1: writes 110
// Transaction 2: writes 120 (overwrites Transaction 1!)
```

### Good: Sequential or atomic updates
```typescript
// ✅ Option 1: Sequential (simple, but slow)
async function updateBalances(transactions: Transaction[]) {
  for (const tx of transactions) {
    await db.users.update(
      tx.userId,
      { balance: db.raw('balance + ?', [tx.amount]) }  // Atomic SQL
    );
  }
}

// ✅ Option 2: Batch atomic update (fast)
async function updateBalances(transactions: Transaction[]) {
  await db.transaction(async (trx) => {
    for (const tx of transactions) {
      await trx.query(
        'UPDATE users SET balance = balance + $1 WHERE id = $2',
        [tx.amount, tx.userId]
      );
    }
  });
}
```

## 5. Locking & Deadlocks

**Red flags:**
- Multiple locks acquired in different order
- Lock held across network calls (long-held locks)
- Nested locks (lock within lock)
- Missing lock release (forget to unlock)
- Lock timeout not configured

**Concurrency patterns:**
- Deadlock (circular wait)
- Livelock (endless retry)
- Lock starvation

**Code examples:**

### Bad: Deadlock risk
```typescript
// ❌ BLOCKER: Deadlock if both run simultaneously
async function transferMoney(fromId: string, toId: string, amount: number) {
  await lockAccount(fromId);
  await lockAccount(toId);

  // Transfer logic

  await unlockAccount(fromId);
  await unlockAccount(toId);
}

// Request 1: transferMoney(A, B)
//   - Locks A
//   - Waits for B
// Request 2: transferMoney(B, A)
//   - Locks B
//   - Waits for A
// DEADLOCK! Both wait forever
```

### Good: Lock ordering prevents deadlock
```typescript
// ✅ Prevent deadlock: Always lock in same order
async function transferMoney(fromId: string, toId: string, amount: number) {
  // Lock in consistent order (alphabetically)
  const [firstId, secondId] = [fromId, toId].sort();

  await lockAccount(firstId);
  await lockAccount(secondId);

  try {
    // Transfer logic
    await db.transaction(async (tx) => {
      await tx.query(
        'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
        [amount, fromId]
      );
      await tx.query(
        'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
        [amount, toId]
      );
    });
  } finally {
    await unlockAccount(secondId);
    await unlockAccount(firstId);
  }
}
```

### Bad: Lock held across network call
```typescript
// ❌ HIGH: Lock held while calling external API (slow!)
async function processPayment(userId: string, amount: number) {
  await lockUser(userId);

  try {
    const user = await db.users.findById(userId);

    // Lock held during slow network call! ❌
    const paymentResult = await stripe.charges.create({
      amount,
      customer: user.stripeId,
    });

    user.balance -= amount;
    await db.users.update(userId, user);
  } finally {
    await unlockUser(userId);
  }
}

// Lock held for seconds (network latency)
// Other requests block waiting for lock
```

### Good: Release lock before network call
```typescript
// ✅ Minimize lock duration: Release before network call
async function processPayment(userId: string, amount: number) {
  // Check balance with lock
  let canProceed = false;
  await lockUser(userId);
  try {
    const user = await db.users.findById(userId);
    if (user.balance >= amount) {
      // Reserve balance
      user.balance -= amount;
      await db.users.update(userId, user);
      canProceed = true;
    }
  } finally {
    await unlockUser(userId);  // Release lock quickly
  }

  if (!canProceed) {
    throw new Error('Insufficient balance');
  }

  // Network call outside lock
  const paymentResult = await stripe.charges.create({
    amount,
    customer: user.stripeId,
  });

  return paymentResult;
}
```

## 6. Idempotency & Retries

**Red flags:**
- Non-idempotent operations (INSERT without duplicate check)
- Missing idempotency keys
- No deduplication for retries
- Side effects on retry (sends email twice)
- Retry on non-retryable errors (400s)

**Concurrency patterns:**
- Duplicate processing
- Non-idempotent retries

**Code examples:**

### Bad: Non-idempotent payment
```typescript
// ❌ BLOCKER: Retry charges customer twice
async function chargeCustomer(userId: string, amount: number) {
  const charge = await stripe.charges.create({
    amount,
    customer: userId,
  });

  await db.charges.insert({
    userId,
    amount,
    stripeChargeId: charge.id,
  });

  return charge;
}

// Request times out after Stripe charge succeeds
// Retry creates second charge! ❌
```

### Good: Idempotent with key
```typescript
// ✅ Idempotent: Use idempotency key
async function chargeCustomer(
  userId: string,
  amount: number,
  idempotencyKey: string
) {
  // Check if already processed
  const existing = await db.charges.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existing;  // Return existing charge
  }

  // Charge with idempotency key
  const charge = await stripe.charges.create({
    amount,
    customer: userId,
  }, {
    idempotencyKey,  // Stripe deduplicates
  });

  // Store with idempotency key
  await db.charges.insert({
    userId,
    amount,
    stripeChargeId: charge.id,
    idempotencyKey,
  });

  return charge;
}

// Retry with same key returns existing charge
```

### Bad: Email sent on retry
```typescript
// ❌ HIGH: Retry sends duplicate emails
async function createOrder(order: Order) {
  const created = await db.orders.insert(order);

  // Send email (not idempotent!)
  await sendOrderConfirmation(order.customerEmail, created.id);

  return created;
}

// Insert succeeds, email fails
// Retry: inserts duplicate (or fails on unique constraint)
// AND sends email again ❌
```

### Good: Idempotent with flag
```typescript
// ✅ Idempotent: Track email sent state
async function createOrder(order: Order) {
  // Use upsert with unique constraint on order_number
  const created = await db.orders.upsert(
    { orderNumber: order.orderNumber },
    {
      ...order,
      emailSent: false,
    }
  );

  // Only send email if not already sent
  if (!created.emailSent) {
    await sendOrderConfirmation(order.customerEmail, created.id);

    // Mark email sent
    await db.orders.update(created.id, { emailSent: true });
  }

  return created;
}

// Retry: upsert returns existing order
// Email only sent once
```

## 7. Background Jobs & Queues

**Red flags:**
- Job executed multiple times (no deduplication)
- No retry limits (infinite retries)
- No job timeout (runs forever)
- Concurrent job processing (not idempotent)
- Job state not tracked (can't resume)

**Concurrency patterns:**
- Duplicate job execution
- At-least-once vs exactly-once

**Code examples:**

### Bad: Job can run twice
```typescript
// ❌ HIGH: Job executed multiple times if worker crashes
async function processPayment(jobId: string) {
  const job = await db.jobs.findById(jobId);

  // Charge customer
  await stripe.charges.create({
    amount: job.amount,
    customer: job.customerId,
  });

  // Mark complete
  await db.jobs.update(jobId, { status: 'completed' });
}

// Job starts, charges customer, crashes before marking complete
// Job retried, charges customer again! ❌
```

### Good: Idempotent job with locking
```typescript
// ✅ Idempotent: Use idempotency key and locking
async function processPayment(jobId: string) {
  // Try to claim job (atomic)
  const claimed = await db.query(
    'UPDATE jobs SET status = $1, worker_id = $2 WHERE id = $3 AND status = $4',
    ['processing', WORKER_ID, jobId, 'pending']
  );

  if (claimed.rowCount === 0) {
    return;  // Already claimed by another worker
  }

  const job = await db.jobs.findById(jobId);

  try {
    // Use idempotency key
    await stripe.charges.create({
      amount: job.amount,
      customer: job.customerId,
    }, {
      idempotencyKey: `payment_${jobId}`,
    });

    await db.jobs.update(jobId, { status: 'completed' });
  } catch (error) {
    await db.jobs.update(jobId, { status: 'failed', error: error.message });
    throw error;
  }
}
```

# WORKFLOW

Read the intake, shape, and plan artifacts to learn the intended behavior. Take the diff scope, the target file path, and the output contract from the dispatch prompt in [_stage.md](_stage.md). Hunt for defects with the checklist above. Record each finding with file and line evidence, a severity, and a confidence.

# OUTPUT FORMAT

Write the findings file to the path and with the structure that the dispatch prompt in [_stage.md](_stage.md) defines. Apply the merge rules that the dispatch prompt cites. Use this skeleton:

```markdown
## Findings
| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]

## Summary
- Open findings: {N} (resolved this run: {N})
```

# IMPORTANT: Simulate Concurrent Execution

This review should:
- **Show interleavings**: Concrete timeline showing race
- **Prove data corruption**: Show incorrect final state
- **Test under load**: Recommend concurrent stress tests
- **Fix with atomicity**: Transactions, locks, constraints
- **Make idempotent**: Handle retries safely

The goal is to catch **"works in dev, breaks under load"** bugs before production.

# WHEN TO USE

Run `/wf review backend-concurrency` when:
- Before releases (production load is higher)
- After money/inventory operations added
- After database queries changed
- After adding retry logic
- When race conditions reported in production

This should be in the default review chain for all backend work types involving shared state.
