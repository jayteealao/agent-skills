---
name: review:data-integrity
description: Review data integrity - ensure stored data remains correct over time, across failures, retries, and concurrent writes
usage: /review:data-integrity [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/models/**", "src/repositories/**")'
    required: false
  - name: CONTEXT
    description: 'Additional context: critical invariants, transactional guarantees, consistency expectations'
    required: false
examples:
  - command: /review:data-integrity pr 123
    description: Review PR #123 for data integrity issues
  - command: /review:data-integrity worktree "src/models/**"
    description: Review model layer for integrity violations
  - command: /review:data-integrity diff main..feature "CONTEXT: Account balance must always be non-negative, order status transitions must follow state machine, user email must be unique"
    description: Review branch diff with integrity constraints
---

# Data Integrity Review

You are a data integrity reviewer ensuring stored data remains correct over time, across failures, retries, and concurrent writes.

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
| add-payment-flow  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-payment-flow`

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

- **`repo`**: Review entire data layer
  - Analyze models, repositories, database schema
  - Check all data mutation operations

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Data Operations

For each file in scope:

1. **Identify data mutations**:
   - CREATE: Insert operations
   - UPDATE: Modify existing data
   - DELETE: Remove data
   - Multi-step operations (create + update across tables)

2. **Read full context** (entire function/class, not just diff lines)

3. **Trace data flow**:
   - What invariants must hold?
   - What constraints exist (DB and application)?
   - What happens on retry or failure?
   - What happens with concurrent access?

**Critical**: Always read the **complete function** and **related database schema** to understand full data flow.

## Step 3: Parse CONTEXT (if provided)

Extract data integrity expectations from `CONTEXT` parameter:

- **Critical invariants**: Rules that must always hold (e.g., "balance >= 0")
- **Transactional guarantees**: ACID requirements, isolation levels
- **Consistency expectations**: Eventual vs strong consistency
- **State machines**: Valid state transitions

Example:
```
CONTEXT: Account balance must always be non-negative, order status follows state machine (pending→processing→completed/failed), user email must be unique, referential integrity enforced for all foreign keys
```

## Step 4: Data Integrity Checklist Review

For each data operation, systematically check:

### 4.1 Invariants & Business Rules
- [ ] Uniqueness constraints enforced?
- [ ] Referential integrity maintained?
- [ ] Required fields validated?
- [ ] State machine transitions valid?
- [ ] Numeric constraints enforced (min/max, non-negative)?
- [ ] Logical consistency maintained (e.g., start_date < end_date)?

**Red flags:**
- Duplicate records created (no unique constraint)
- Orphaned records (foreign key not enforced)
- Invalid state transitions (pending → completed, skipping processing)
- Negative balances allowed
- Required fields nullable

**Invariant examples:**
```typescript
// ❌ BAD: No uniqueness constraint (duplicates possible)
async function createUser(email: string, name: string) {
  // ❌ No check if email already exists
  await db.insert('users', { email, name });
}

// User can be created multiple times with same email:
await createUser('alice@example.com', 'Alice');
await createUser('alice@example.com', 'Alice Duplicate');  // ❌ Allowed

// ✅ GOOD: Uniqueness enforced at DB level
// migration.sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,  -- ✅ DB constraint
  name VARCHAR(255) NOT NULL
);

// Application code:
async function createUser(email: string, name: string) {
  try {
    await db.insert('users', { email, name });
  } catch (error) {
    if (error.code === '23505') {  // PostgreSQL unique violation
      throw new DuplicateEmailError(email);
    }
    throw error;
  }
}

// ❌ BAD: No referential integrity (orphaned records)
async function createOrder(userId: string, items: Item[]) {
  // ❌ No check if user exists
  await db.insert('orders', { user_id: userId, total: 100 });
}

// Order created for non-existent user:
await createOrder('user-999', items);  // ❌ Orphaned order

// ✅ GOOD: Foreign key constraint
// migration.sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),  -- ✅ FK constraint
  total DECIMAL(10, 2) NOT NULL
);

// ❌ BAD: Invalid state transition
async function completeOrder(orderId: string) {
  // ❌ No check of current state
  await db.update('orders', { id: orderId }, { status: 'completed' });
}

// Can transition from any state to completed:
// pending → completed ✓
// processing → completed ✓
// failed → completed ❌ Invalid!
// cancelled → completed ❌ Invalid!

// ✅ GOOD: State machine enforced
type OrderStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ['processing', 'cancelled'],
  processing: ['completed', 'failed'],
  completed: [],  // Terminal state
  failed: [],     // Terminal state
  cancelled: []   // Terminal state
};

async function transitionOrder(orderId: string, newStatus: OrderStatus) {
  const order = await db.findOne('orders', { id: orderId });

  // ✅ Check if transition is valid
  const allowedNext = validTransitions[order.status];
  if (!allowedNext.includes(newStatus)) {
    throw new InvalidStateTransitionError(
      `Cannot transition from ${order.status} to ${newStatus}`
    );
  }

  await db.update('orders', { id: orderId }, { status: newStatus });
}

// ❌ BAD: Negative balance allowed
async function withdraw(accountId: string, amount: number) {
  const account = await db.findOne('accounts', { id: accountId });
  const newBalance = account.balance - amount;

  // ❌ No check for negative balance
  await db.update('accounts', { id: accountId }, { balance: newBalance });
}

// Can overdraw account:
await withdraw('acc-123', 1000000);  // ❌ Balance goes negative

// ✅ GOOD: Invariant enforced (balance >= 0)
async function withdraw(accountId: string, amount: number) {
  const account = await db.findOne('accounts', { id: accountId });
  const newBalance = account.balance - amount;

  // ✅ Check invariant
  if (newBalance < 0) {
    throw new InsufficientFundsError(
      `Cannot withdraw ${amount}. Balance: ${account.balance}`
    );
  }

  await db.update('accounts', { id: accountId }, { balance: newBalance });
}

// ✅ BETTER: Check constraint at DB level
// migration.sql
CREATE TABLE accounts (
  id BIGSERIAL PRIMARY KEY,
  balance DECIMAL(10, 2) NOT NULL CHECK (balance >= 0),  -- ✅ DB enforces
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 4.2 Database Constraints
- [ ] Unique constraints defined where needed?
- [ ] Foreign key constraints defined?
- [ ] NOT NULL constraints on required fields?
- [ ] CHECK constraints for business rules?
- [ ] Application validations match DB constraints?

**Red flags:**
- Uniqueness checked in app but not DB (race conditions)
- Foreign keys not defined (orphaned records)
- Application validates but DB allows invalid data
- Mismatch between app and DB constraints

**Constraint examples:**
```sql
-- ❌ BAD: No constraints (relies on application)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255),        -- ❌ Can be NULL
  age INT                    -- ❌ Can be negative or 1000
);

-- Application tries to enforce:
if (!email) throw new Error('Email required');
if (age < 0 || age > 150) throw new Error('Invalid age');

-- But can be bypassed:
INSERT INTO users (email, age) VALUES (NULL, -5);  -- ❌ Succeeds!

-- ✅ GOOD: Constraints at DB level (defense in depth)
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,  -- ✅ Required and unique
  age INT NOT NULL CHECK (age >= 0 AND age <= 150),  -- ✅ Valid range
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Application validations should match:
function validateUser(data: CreateUserDTO) {
  if (!data.email) throw new ValidationError('Email required');
  if (!data.email.match(EMAIL_REGEX)) throw new ValidationError('Invalid email');
  if (data.age < 0 || data.age > 150) throw new ValidationError('Age must be 0-150');
}

-- ❌ BAD: Uniqueness only in app (race condition)
async function createUser(email: string) {
  // Check if exists
  const existing = await db.findOne('users', { email });
  if (existing) {
    throw new DuplicateEmailError(email);
  }

  // Race condition: Another request can insert between check and insert
  await db.insert('users', { email });
}

// Concurrent requests:
// Request A: Check email → not found → insert
// Request B: Check email → not found → insert
// Result: Duplicate emails!

-- ✅ GOOD: Unique constraint at DB level
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE  -- ✅ Prevents duplicates
);

async function createUser(email: string) {
  try {
    await db.insert('users', { email });
  } catch (error) {
    if (error.code === '23505') {  // Unique violation
      throw new DuplicateEmailError(email);
    }
    throw error;
  }
}

-- ✅ GOOD: Referential integrity
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- ✅ FK
  product_id BIGINT NOT NULL REFERENCES products(id),  -- ✅ FK
  quantity INT NOT NULL CHECK (quantity > 0),  -- ✅ Positive quantity
  total DECIMAL(10, 2) NOT NULL CHECK (total >= 0)  -- ✅ Non-negative total
);

-- Cannot create order for non-existent user:
INSERT INTO orders (user_id, product_id, quantity, total)
VALUES (99999, 1, 1, 10.00);  -- ❌ ERROR: foreign key violation

-- Cascading delete:
DELETE FROM users WHERE id = 123;
-- All orders for user 123 are automatically deleted
```

### 4.3 Transactions & Atomicity
- [ ] Multi-step operations in transaction?
- [ ] Isolation level appropriate for use case?
- [ ] Read-modify-write patterns use SELECT FOR UPDATE?
- [ ] Transaction boundaries clear?
- [ ] Rollback on error?

**Red flags:**
- Multi-step write not in transaction (partial state)
- Read-modify-write without locking (lost updates)
- Wrong isolation level (read committed for serializable operation)
- Long-running transactions (holds locks)

**Transaction examples:**
```typescript
// ❌ BAD: Multi-step write without transaction
async function transferMoney(fromId: string, toId: string, amount: number) {
  const from = await db.findOne('accounts', { id: fromId });
  const to = await db.findOne('accounts', { id: toId });

  // Step 1: Withdraw from source
  await db.update('accounts', { id: fromId }, {
    balance: from.balance - amount
  });

  // ❌ If this fails, money is lost (withdrawn but not deposited)
  throw new Error('Network error');

  // Step 2: Deposit to destination
  await db.update('accounts', { id: toId }, {
    balance: to.balance + amount
  });
}

// Money withdrawn but not deposited → data corruption!

// ✅ GOOD: Transactional
async function transferMoney(fromId: string, toId: string, amount: number) {
  await db.transaction(async (tx) => {
    const from = await tx.findOne('accounts', { id: fromId });
    const to = await tx.findOne('accounts', { id: toId });

    // Check invariant
    if (from.balance < amount) {
      throw new InsufficientFundsError();
    }

    // Both updates in same transaction
    await tx.update('accounts', { id: fromId }, {
      balance: from.balance - amount
    });

    await tx.update('accounts', { id: toId }, {
      balance: to.balance + amount
    });

    // ✅ If any step fails, all are rolled back
  });
}

// ❌ BAD: Lost update (race condition)
async function incrementCounter(counterId: string) {
  const counter = await db.findOne('counters', { id: counterId });

  // Race condition: Another request can read between read and write
  const newValue = counter.value + 1;

  await db.update('counters', { id: counterId }, { value: newValue });
}

// Concurrent execution:
// Request A: Read (value=10) → Increment (11) → Write (11)
// Request B: Read (value=10) → Increment (11) → Write (11)
// Expected: 12, Actual: 11 (lost update!)

// ✅ GOOD: SELECT FOR UPDATE (pessimistic locking)
async function incrementCounter(counterId: string) {
  await db.transaction(async (tx) => {
    // ✅ Lock row for update
    const counter = await tx.query(
      'SELECT * FROM counters WHERE id = $1 FOR UPDATE',
      [counterId]
    );

    const newValue = counter.value + 1;

    await tx.update('counters', { id: counterId }, { value: newValue });
  });
}

// ✅ BETTER: Atomic increment (optimistic)
async function incrementCounter(counterId: string) {
  await db.query(
    'UPDATE counters SET value = value + 1 WHERE id = $1',
    [counterId]
  );
}

// No race condition - single atomic operation

// ❌ BAD: Wrong isolation level
async function processOrder(orderId: string) {
  // Uses default READ COMMITTED
  await db.transaction(async (tx) => {
    const order = await tx.findOne('orders', { id: orderId });

    // Check inventory
    const product = await tx.findOne('products', { id: order.product_id });

    if (product.stock < order.quantity) {
      throw new OutOfStockError();
    }

    // ❌ Between check and update, another transaction can modify stock
    // Result: Overselling (negative stock)

    // Decrement stock
    await tx.update('products', { id: order.product_id }, {
      stock: product.stock - order.quantity
    });
  });
}

// ✅ GOOD: Use SERIALIZABLE isolation or SELECT FOR UPDATE
async function processOrder(orderId: string) {
  await db.transaction(async (tx) => {
    // Set isolation level
    await tx.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    const order = await tx.findOne('orders', { id: orderId });

    // Lock product row
    const product = await tx.query(
      'SELECT * FROM products WHERE id = $1 FOR UPDATE',
      [order.product_id]
    );

    if (product.stock < order.quantity) {
      throw new OutOfStockError();
    }

    // Decrement stock (locked, no concurrent modification)
    await tx.update('products', { id: order.product_id }, {
      stock: product.stock - order.quantity
    });
  });
}

// ✅ BETTER: Atomic check and update
async function processOrder(orderId: string) {
  await db.transaction(async (tx) => {
    const order = await tx.findOne('orders', { id: orderId });

    // Atomic: Check and decrement in one query
    const result = await tx.query(`
      UPDATE products
      SET stock = stock - $1
      WHERE id = $2 AND stock >= $1
      RETURNING *
    `, [order.quantity, order.product_id]);

    if (result.rowCount === 0) {
      throw new OutOfStockError();
    }
  });
}
```

### 4.4 Concurrency & Race Conditions
- [ ] Lost updates prevented (SELECT FOR UPDATE, optimistic locking)?
- [ ] Double creates prevented (unique constraints, idempotency keys)?
- [ ] Check-then-act patterns protected?
- [ ] Concurrent modifications handled?

**Red flags:**
- Read-modify-write without locking
- Check-then-insert without unique constraint
- Incrementing counters by reading then writing
- No conflict resolution strategy

**Concurrency examples:**
```typescript
// ❌ BAD: Double booking (race condition)
async function bookSeat(seatId: string, userId: string) {
  const seat = await db.findOne('seats', { id: seatId });

  // Check if available
  if (seat.booked_by !== null) {
    throw new SeatAlreadyBookedError();
  }

  // ❌ Race condition: Two requests can pass the check
  await db.update('seats', { id: seatId }, { booked_by: userId });
}

// Concurrent requests:
// Request A: Check (available) → Book for user A
// Request B: Check (available) → Book for user B
// Result: Seat booked by both users!

// ✅ GOOD: Optimistic locking with version
async function bookSeat(seatId: string, userId: string) {
  const seat = await db.findOne('seats', { id: seatId });

  if (seat.booked_by !== null) {
    throw new SeatAlreadyBookedError();
  }

  // Optimistic lock: Update only if version matches
  const result = await db.query(`
    UPDATE seats
    SET booked_by = $1, version = version + 1
    WHERE id = $2 AND version = $3 AND booked_by IS NULL
    RETURNING *
  `, [userId, seatId, seat.version]);

  if (result.rowCount === 0) {
    // Concurrent modification detected
    throw new SeatBookingConflictError();
  }
}

// ✅ BETTER: Unique constraint (only one booking per seat)
// migration.sql
CREATE TABLE seats (
  id BIGSERIAL PRIMARY KEY,
  seat_number VARCHAR(10) NOT NULL UNIQUE,
  booked_by BIGINT UNIQUE,  -- ✅ Only one user can book
  FOREIGN KEY (booked_by) REFERENCES users(id)
);

// ❌ BAD: Duplicate event processing
async function processEvent(event: Event) {
  // ❌ No deduplication
  await db.insert('processed_events', {
    event_id: event.id,
    processed_at: new Date()
  });

  await sendEmail(event.email, event.message);
}

// If event delivered twice (at-least-once delivery):
// processEvent(event1);
// processEvent(event1);  // ❌ Duplicate processing

// ✅ GOOD: Idempotency with unique constraint
// migration.sql
CREATE TABLE processed_events (
  event_id VARCHAR(255) PRIMARY KEY,  -- ✅ Unique event ID
  processed_at TIMESTAMP NOT NULL
);

async function processEvent(event: Event) {
  try {
    // Try to insert (will fail if duplicate)
    await db.insert('processed_events', {
      event_id: event.id,
      processed_at: new Date()
    });

    // Only send email if insert succeeded (first time processing)
    await sendEmail(event.email, event.message);

  } catch (error) {
    if (error.code === '23505') {  // Unique violation
      console.log(`Event ${event.id} already processed, skipping`);
      return;  // ✅ Idempotent
    }
    throw error;
  }
}

// ❌ BAD: Concurrent order total calculation
async function addItemToOrder(orderId: string, item: OrderItem) {
  const order = await db.findOne('orders', { id: orderId });

  // Add item
  await db.insert('order_items', {
    order_id: orderId,
    product_id: item.product_id,
    quantity: item.quantity,
    price: item.price
  });

  // ❌ Race condition: Another request can add item between read and write
  const newTotal = order.total + (item.price * item.quantity);

  await db.update('orders', { id: orderId }, { total: newTotal });
}

// Concurrent additions:
// Request A: Add item ($10) → Total = $110
// Request B: Add item ($20) → Total = $120 (reads old $100)
// Result: Lost update ($10 item not counted)

// ✅ GOOD: Calculate total from items (source of truth)
async function addItemToOrder(orderId: string, item: OrderItem) {
  await db.transaction(async (tx) => {
    // Add item
    await tx.insert('order_items', {
      order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      price: item.price
    });

    // Recalculate total from all items (atomic)
    await tx.query(`
      UPDATE orders
      SET total = (
        SELECT SUM(price * quantity)
        FROM order_items
        WHERE order_id = $1
      )
      WHERE id = $1
    `, [orderId]);
  });
}

// ✅ ALTERNATIVE: Total is derived (never stored)
async function getOrder(orderId: string) {
  const order = await db.findOne('orders', { id: orderId });
  const items = await db.find('order_items', { order_id: orderId });

  return {
    ...order,
    items,
    total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  };
}
```

### 4.5 Idempotency & Deduplication
- [ ] Retry-safe operations (no duplicates on retry)?
- [ ] Idempotency keys used for critical operations?
- [ ] Event processing deduplicated?
- [ ] Network failures handled without double-writes?

**Red flags:**
- No idempotency for payment/order creation
- Event processing not deduplicated
- Retries create duplicate records
- No way to detect duplicate requests

**Idempotency examples:**
```typescript
// ❌ BAD: Not idempotent (creates duplicate on retry)
async function createPayment(orderId: string, amount: number) {
  // ❌ No idempotency check
  await db.insert('payments', {
    order_id: orderId,
    amount,
    status: 'pending'
  });

  await paymentGateway.charge(amount);
}

// If network fails after insert but before response:
// Client retries → Duplicate payment created!

// ✅ GOOD: Idempotency key
async function createPayment(
  orderId: string,
  amount: number,
  idempotencyKey: string
) {
  // Check if already processed
  const existing = await db.findOne('payments', { idempotency_key: idempotencyKey });

  if (existing) {
    console.log(`Payment already processed: ${idempotencyKey}`);
    return existing;  // ✅ Return existing payment (idempotent)
  }

  // Process payment
  await db.insert('payments', {
    order_id: orderId,
    amount,
    status: 'pending',
    idempotency_key: idempotencyKey  // ✅ Store key
  });

  await paymentGateway.charge(amount, { idempotencyKey });

  return payment;
}

// migration.sql
CREATE TABLE payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id),
  amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL,
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,  -- ✅ Unique constraint
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

// ❌ BAD: Event processed multiple times
async function handleOrderCreatedEvent(event: OrderCreatedEvent) {
  // ❌ No deduplication
  await db.insert('order_notifications', {
    order_id: event.order_id,
    sent_at: new Date()
  });

  await sendEmail(event.user_email, 'Order created');
}

// If event delivered twice:
// User receives duplicate emails!

// ✅ GOOD: Event deduplication
// migration.sql
CREATE TABLE processed_events (
  event_id VARCHAR(255) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMP NOT NULL,
  INDEX idx_event_type_processed (event_type, processed_at)
);

async function handleOrderCreatedEvent(event: OrderCreatedEvent) {
  await db.transaction(async (tx) => {
    // Try to mark event as processed
    try {
      await tx.insert('processed_events', {
        event_id: event.id,
        event_type: 'OrderCreated',
        processed_at: new Date()
      });
    } catch (error) {
      if (error.code === '23505') {  // Already processed
        console.log(`Event ${event.id} already processed`);
        return;  // ✅ Idempotent
      }
      throw error;
    }

    // First time processing
    await tx.insert('order_notifications', {
      order_id: event.order_id,
      sent_at: new Date()
    });

    await sendEmail(event.user_email, 'Order created');
  });
}

// ❌ BAD: Webhook not idempotent
app.post('/webhooks/payment', async (req, res) => {
  const { orderId, status } = req.body;

  // ❌ No deduplication (webhook can be sent multiple times)
  await db.update('orders', { id: orderId }, { payment_status: status });

  res.json({ success: true });
});

// Webhook sent twice → Order updated twice (might be OK, but unsafe)

// ✅ GOOD: Webhook deduplication
app.post('/webhooks/payment', async (req, res) => {
  const { orderId, status } = req.body;
  const webhookId = req.headers['x-webhook-id'];  // Unique ID from provider

  if (!webhookId) {
    return res.status(400).json({ error: 'Missing webhook ID' });
  }

  // Check if already processed
  const existing = await db.findOne('processed_webhooks', { webhook_id: webhookId });

  if (existing) {
    console.log(`Webhook ${webhookId} already processed`);
    return res.json({ success: true });  // ✅ Idempotent response
  }

  await db.transaction(async (tx) => {
    // Mark webhook as processed
    await tx.insert('processed_webhooks', {
      webhook_id: webhookId,
      processed_at: new Date()
    });

    // Update order
    await tx.update('orders', { id: orderId }, { payment_status: status });
  });

  res.json({ success: true });
});
```

### 4.6 Derived Data Consistency
- [ ] Cached data invalidated on source update?
- [ ] Denormalized fields updated with source?
- [ ] Materialized views refreshed?
- [ ] Aggregates recalculated correctly?
- [ ] Eventual consistency documented?

**Red flags:**
- Cache never invalidated (stale forever)
- Denormalized data out of sync with source
- Aggregates computed incorrectly
- No strategy for consistency of derived data

**Derived data examples:**
```typescript
// ❌ BAD: Cache never invalidated
async function getUser(userId: string) {
  const cached = await cache.get(`user:${userId}`);
  if (cached) return cached;

  const user = await db.findOne('users', { id: userId });
  await cache.set(`user:${userId}`, user);  // ❌ No TTL, no invalidation

  return user;
}

async function updateUser(userId: string, updates: Partial<User>) {
  await db.update('users', { id: userId }, updates);
  // ❌ Cache not invalidated - stale data served forever
}

// ✅ GOOD: Cache invalidation
async function getUser(userId: string) {
  const cached = await cache.get(`user:${userId}`);
  if (cached) return JSON.parse(cached);

  const user = await db.findOne('users', { id: userId });

  // Cache with TTL (5 minutes)
  await cache.setex(`user:${userId}`, 300, JSON.stringify(user));

  return user;
}

async function updateUser(userId: string, updates: Partial<User>) {
  await db.update('users', { id: userId }, updates);

  // ✅ Invalidate cache
  await cache.del(`user:${userId}`);
}

// ❌ BAD: Denormalized data out of sync
// orders table has denormalized user_name
async function updateUserName(userId: string, newName: string) {
  await db.update('users', { id: userId }, { name: newName });
  // ❌ Denormalized user_name in orders not updated
}

// Result: orders.user_name shows old name

// ✅ GOOD: Update denormalized data
async function updateUserName(userId: string, newName: string) {
  await db.transaction(async (tx) => {
    // Update source
    await tx.update('users', { id: userId }, { name: newName });

    // Update denormalized copies
    await tx.update('orders', { user_id: userId }, { user_name: newName });
  });
}

// ✅ BETTER: Don't denormalize (join instead)
// Only denormalize if performance requires it

// ❌ BAD: Aggregate not updated
async function addOrderItem(orderId: string, item: OrderItem) {
  await db.insert('order_items', {
    order_id: orderId,
    ...item
  });

  // ❌ orders.item_count not updated
}

// ✅ GOOD: Update aggregate
async function addOrderItem(orderId: string, item: OrderItem) {
  await db.transaction(async (tx) => {
    await tx.insert('order_items', {
      order_id: orderId,
      ...item
    });

    // Update aggregate
    await tx.query(`
      UPDATE orders
      SET item_count = item_count + 1,
          total = total + ($1 * $2)
      WHERE id = $3
    `, [item.price, item.quantity, orderId]);
  });
}

// ✅ BETTER: Compute aggregate on read (source of truth)
async function getOrder(orderId: string) {
  const order = await db.query(`
    SELECT
      o.*,
      COUNT(oi.id) as item_count,
      SUM(oi.price * oi.quantity) as total
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    WHERE o.id = $1
    GROUP BY o.id
  `, [orderId]);

  return order;
}
```

### 4.7 Time & Ordering
- [ ] Timestamps use database time (not application)?
- [ ] Ordering guarantees explicit (FIFO, eventual)?
- [ ] Clock skew considered for distributed systems?
- [ ] Created/updated timestamps maintained?
- [ ] Chronological operations use correct ordering?

**Red flags:**
- Using application time for timestamps (clock skew)
- No ordering guarantees for events
- Comparing timestamps across servers
- Missing created_at/updated_at

**Time examples:**
```typescript
// ❌ BAD: Application time (clock skew)
async function createOrder(userId: string) {
  await db.insert('orders', {
    user_id: userId,
    created_at: new Date()  // ❌ Application server time
  });
}

// Problems:
// - App servers have different clocks (skew up to seconds)
// - Order created_at may be out of order
// - Cannot rely on created_at for ordering

// ✅ GOOD: Database time (single source of truth)
// migration.sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),  -- ✅ DB time
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

// Application:
async function createOrder(userId: string) {
  await db.insert('orders', {
    user_id: userId
    // ✅ created_at set by database
  });
}

// ❌ BAD: Manual updated_at management
async function updateOrder(orderId: string, updates: Partial<Order>) {
  await db.update('orders', { id: orderId }, {
    ...updates,
    updated_at: new Date()  // ❌ Easily forgotten
  });
}

// ✅ GOOD: Automatic updated_at trigger
-- migration.sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();

// ❌ BAD: Ordering not guaranteed
async function getRecentOrders(userId: string) {
  const orders = await db.find('orders', { user_id: userId });
  // ❌ No ORDER BY - order not guaranteed
  return orders;
}

// ✅ GOOD: Explicit ordering
async function getRecentOrders(userId: string) {
  const orders = await db.query(`
    SELECT * FROM orders
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC  -- ✅ Explicit order
    LIMIT 100
  `, [userId]);

  return orders;
}
```

## Step 5: Generate Findings

For **each data integrity issue** found, create a finding with:

### Finding Format

```markdown
### DI-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**Data Integrity Violation:**
- **Invariant Violated:** [Which invariant can be broken?]
- **Corruption Scenario:** [How can data become corrupt?]
- **Detection:** [How would you detect this corruption?]
- **Recovery:** [How to fix corrupt data?]

**Corruption Scenario:**
```
Step-by-step:
1. [Initial state]
2. [Operation A]
3. [Operation B or failure]
4. [Result: corrupt data]

Example:
- User has balance: $100
- Withdraw $50 (balance → $50)
- Network failure before commit
- Retry withdraw $50
- Balance → $0 (should be $50)
- User lost $50!
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (data integrity at risk)
[current code]

// ✅ AFTER (data integrity protected)
[fixed code with constraints, transactions, etc.]
```

**Why This Fix:**
[Explain how this prevents data corruption]

**Migration (if DB constraints added):**
```sql
[Migration to add constraints]
```
```

### Severity Guidelines

- **BLOCKER**: Critical data corruption risk (money, user data)
  - Example: No transaction for multi-step money transfer
  - Example: Race condition allowing negative balance

- **HIGH**: Data inconsistency risk, violates business rules
  - Example: Duplicate records created (no unique constraint)
  - Example: Orphaned records (no foreign key)

- **MED**: Data quality issue, eventual consistency problems
  - Example: Cache not invalidated (stale data)
  - Example: Denormalized data out of sync

- **LOW**: Minor data quality issue
  - Example: Missing created_at timestamp
  - Example: Could add check constraint

- **NIT**: Best practice suggestion
  - Example: Could use database default for timestamps

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with invariants:

1. **Check critical invariants**
   - Example: "balance >= 0" → verify all balance updates check this

2. **Validate state machines**
   - Example: "order status transitions" → check valid transitions

3. **Verify consistency guarantees**
   - Example: "strong consistency" → check transactions used

## Step 7: Data Integrity Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER**:

1. **Multi-step money operations without transaction**
2. **No uniqueness constraint where uniqueness required** (emails, idempotency keys)
3. **Race conditions in read-modify-write** patterns
4. **Payment operations not idempotent**
5. **Critical invariants not enforced** (negative balances, invalid states)
6. **Orphaned records due to missing foreign keys**

## Step 8: Test Data Integrity

For critical operations, test:

1. **Concurrent access**: Run operations concurrently, check for race conditions
2. **Retry safety**: Retry operations, check for duplicates
3. **Failure recovery**: Simulate failures mid-operation, check for partial state
4. **Constraint violations**: Try to violate constraints, verify protection

## Step 9: Write Data Integrity Report

Create `.claude/<SESSION_SLUG>/reviews/data-integrity.md`:

[Report structure similar to previous review commands]

## Step 10: Output Summary

Print to console:

```
🔍 Data Integrity Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

🛡️  Critical invariants: [list checked invariants]

📝 Full report: .claude/<SESSION_SLUG>/reviews/data-integrity.md

⚠️  BLOCKER items: [list titles]
```

---

## Notes

- **Read full data operations**: Always read complete functions that mutate data
- **Trace concurrent scenarios**: Think through concurrent execution
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after with constraints/transactions
- **Cross-reference CONTEXT**: Check against stated invariants
- **False positives welcome**: Encourage users to challenge interpretations
