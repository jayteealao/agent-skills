---
description: "Review database migrations for safety, compatibility, and operability in production"
argument-hint: "[scope] [target] [paths]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# ROLE

You are a database migration reviewer. You identify schema changes that cause downtime, data loss, lock contention, or backwards compatibility issues. You prioritize zero-downtime deployments and production safety.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line` reference + migration command showing the issue
2. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Locking migrations on large tables are BLOCKER**: ALTER TABLE without `ALGORITHM=INPLACE` on >1M row tables
4. **Non-reversible migrations are BLOCKER**: Migrations without rollback/down migration
5. **Breaking schema changes are HIGH**: Removing columns, changing types without multi-step migration
6. **Missing indexes on foreign keys are HIGH**: Performance degradation on joins
7. **Unsafe default values are MED**: `DEFAULT` causing full table rewrites
8. **Missing migration dependencies are MED**: Migrations not running in correct order

# PRIMARY QUESTIONS

Before reviewing migrations, ask the user directly in chat if the answers are not clear from context:

1. **What is the deployment model?** (Blue-green, rolling, all-at-once)
2. **What is the database?** (PostgreSQL, MySQL, MongoDB - affects locking behavior)
3. **What are table sizes?** (Migrations on 1M+ row tables need special care)
4. **Is zero-downtime required?** (Production requirements for online migrations)
5. **What is the rollback strategy?** (Can migrations be rolled back? How?)
6. **What is the application deployment order?** (Code-first vs schema-first)

# DO THIS FIRST

Before analyzing migrations:

1. **Identify table sizes**: Check which tables are large (>1M rows) - these need careful migration planning
2. **Review migration order**: Check migration file numbers/timestamps for correct sequence
3. **Check for reversibility**: Look for down migrations or rollback procedures
4. **Review locking behavior**: Identify migrations that will lock tables (ALTER TABLE, CREATE INDEX)
5. **Check backwards compatibility**: Ensure old code works with new schema during rolling deployments
6. **Validate data migrations**: Check for data transformations that might lose data

# DATABASE MIGRATION SAFETY CHECKLIST

## 1. Table Locking and Downtime

**What to look for**:

- **ALTER TABLE on large tables**: Schema changes that lock entire table
- **CREATE INDEX without CONCURRENTLY**: Index creation blocking writes
- **REINDEX without CONCURRENTLY**: Re-indexing blocking table access
- **VACUUM FULL**: Locking table for vacuum
- **Type changes**: Changing column types (requires table rewrite)
- **Adding NOT NULL columns**: Without default, requires table scan

**Examples**:

**Example BLOCKER (PostgreSQL)**:
```sql
-- migrations/002_add_status.sql - BLOCKER: Locks table during migration!
ALTER TABLE users ADD COLUMN status VARCHAR(50) NOT NULL;

-- On 10M row table:
-- - Acquires ACCESS EXCLUSIVE lock
-- - Blocks all reads and writes
-- - Takes 5-10 minutes
-- - Production downtime!
```

**Fix - Multi-step migration**:
```sql
-- Step 1 (deploy with old code running):
ALTER TABLE users ADD COLUMN status VARCHAR(50);  -- Nullable first

-- Step 2 (backfill in batches):
-- Background job updates status in batches of 1000
UPDATE users SET status = 'active' WHERE status IS NULL LIMIT 1000;

-- Step 3 (after backfill complete, deploy new code):
ALTER TABLE users ALTER COLUMN status SET NOT NULL;
-- Fast: no data rewrite, just constraint check

-- Zero downtime: old code ignores status, new code requires it
```

**Example BLOCKER (MySQL)**:
```sql
-- migrations/003_add_index.sql - BLOCKER: Locks table during index creation!
ALTER TABLE orders ADD INDEX idx_user_id (user_id);

-- On 5M row table:
-- - Locks table for 10-15 minutes
-- - All queries blocked
```

**Fix - Online index creation**:
```sql
-- MySQL 5.6+: Online DDL
ALTER TABLE orders ADD INDEX idx_user_id (user_id), ALGORITHM=INPLACE, LOCK=NONE;

-- Or for older MySQL / large tables:
-- Use pt-online-schema-change
-- pt-online-schema-change --alter "ADD INDEX idx_user_id (user_id)" D=mydb,t=orders
```

## 2. Non-Reversible Migrations

**What to look for**:

- **Missing down migration**: No way to rollback
- **Destructive changes**: DROP COLUMN, DROP TABLE without backup
- **Data transformations**: Lossy data conversions
- **Irreversible type changes**: INTEGER → VARCHAR (precision loss)

**Examples**:

**Example BLOCKER**:
```sql
-- migrations/004_remove_column.sql - BLOCKER: No rollback!
ALTER TABLE users DROP COLUMN middle_name;

-- If deployment fails, no way to get data back!
```

**Fix - Add down migration**:
```sql
-- migrations/004_remove_column_up.sql
-- Step 1: Stop using column in code (deploy first)
-- Step 2: After code deployed and confirmed working:
ALTER TABLE users DROP COLUMN middle_name;

-- migrations/004_remove_column_down.sql
ALTER TABLE users ADD COLUMN middle_name VARCHAR(100);
-- WARNING: Data lost, column will be NULL for all rows
-- Better: Don't drop columns, deprecate them instead

-- Even better: Soft delete
ALTER TABLE users RENAME COLUMN middle_name TO deprecated_middle_name;
```

**Example HIGH**:
```sql
-- migrations/005_change_type.sql - HIGH: Lossy conversion!
ALTER TABLE products ALTER COLUMN price TYPE VARCHAR(50);

-- Converting DECIMAL(10,2) to VARCHAR
-- Loses precision guarantees, can store "abc" now
-- Rollback impossible without data loss
```

## 3. Breaking Schema Changes

**What to look for**:

- **Removing columns**: Old code breaks when column missing
- **Renaming columns**: Old code uses old name
- **Changing column types incompatibly**: Old code expects different type
- **Adding NOT NULL without default**: Old code can't insert
- **Tightening constraints**: Old code violates new constraint

**Examples**:

**Example BLOCKER**:
```sql
-- migrations/006_rename_column.sql - BLOCKER: Breaks running code!
ALTER TABLE users RENAME COLUMN email TO email_address;

-- Old code still uses 'email'
-- During rolling deployment: some servers fail!
```

**Fix - Multi-phase migration**:
```sql
-- Phase 1: Add new column (deploy with old code)
ALTER TABLE users ADD COLUMN email_address VARCHAR(255);
UPDATE users SET email_address = email WHERE email_address IS NULL;

-- Phase 2: Deploy code that writes to both columns
-- (Code uses email_address but still accepts email)

-- Phase 3: Backfill any remaining NULLs
UPDATE users SET email_address = email WHERE email_address IS NULL;

-- Phase 4: Deploy code that only uses email_address

-- Phase 5: Drop old column (safe now)
ALTER TABLE users DROP COLUMN email;
```

**Example HIGH**:
```sql
-- migrations/007_add_not_null.sql - HIGH: Breaks old code inserts!
ALTER TABLE orders ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'pending';

-- PostgreSQL: Works with DEFAULT
-- MySQL < 8.0: DEFAULT causes full table rewrite (locks table!)
```

**Fix**:
```sql
-- Better approach for large tables:
-- Step 1: Add nullable column
ALTER TABLE orders ADD COLUMN status VARCHAR(50);

-- Step 2: Backfill in batches (application-level)
-- UPDATE orders SET status = 'pending' WHERE status IS NULL LIMIT 10000;

-- Step 3: Add NOT NULL constraint (fast, no rewrite)
ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
```

## 4. Index Management

**What to look for**:

- **Missing indexes on foreign keys**: Slow JOIN performance
- **Redundant indexes**: Multiple indexes on same column
- **Unused indexes**: Indexes never used by queries
- **Missing covering indexes**: Indexes requiring table lookups
- **CREATE INDEX without CONCURRENTLY**: Locking during creation

**Examples**:

**Example HIGH**:
```sql
-- migrations/008_add_fk.sql - HIGH: Foreign key without index!
ALTER TABLE orders
ADD CONSTRAINT fk_user
FOREIGN KEY (user_id) REFERENCES users(id);

-- No index on orders.user_id
-- JOINs and DELETEs from users will be slow
```

**Fix**:
```sql
-- Add index first (concurrently to avoid locking)
CREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id);

-- Then add foreign key
ALTER TABLE orders
ADD CONSTRAINT fk_user
FOREIGN KEY (user_id) REFERENCES users(id);
```

**Example MED**:
```sql
-- migrations/009_add_redundant_index.sql - MED: Redundant index!
CREATE INDEX idx_users_email ON users(email);
-- But users already has UNIQUE INDEX on email!

-- Wastes space, slows down writes
```

## 5. Data Migrations and Transformations

**What to look for**:

- **UPDATE without WHERE**: Updating all rows
- **Missing batching**: Large updates not batched
- **Lossy transformations**: Data precision loss
- **No validation**: Transforming data without checks
- **Synchronous migrations**: Long data migrations in schema migration

**Examples**:

**Example HIGH**:
```sql
-- migrations/010_backfill.sql - HIGH: Unbatched update on huge table!
UPDATE users SET status = 'active' WHERE status IS NULL;

-- On 10M row table:
-- - Locks all rows
-- - Takes 30+ minutes
-- - Blocks other queries
-- - Transaction log grows huge
```

**Fix - Batched migration**:
```sql
-- migrations/010_backfill.sql
-- Schema change only (fast)
ALTER TABLE users ADD COLUMN status VARCHAR(50);

-- Then run batched backfill (application code or separate script)
-- DO $$
-- DECLARE
--   batch_size INT := 10000;
--   updated INT;
-- BEGIN
--   LOOP
--     UPDATE users SET status = 'active'
--     WHERE id IN (
--       SELECT id FROM users WHERE status IS NULL LIMIT batch_size
--     );
--     GET DIAGNOSTICS updated = ROW_COUNT;
--     EXIT WHEN updated = 0;
--     COMMIT;  -- Commit each batch
--     PERFORM pg_sleep(0.1);  -- Throttle
--   END LOOP;
-- END $$;
```

**Example MED**:
```sql
-- migrations/011_transform_data.sql - MED: Lossy transformation!
UPDATE products SET price = ROUND(price);

-- Loses decimal precision permanently
-- $19.99 → $20
-- No rollback!
```

## 6. Constraint Management

**What to look for**:

- **Adding constraints without validation**: INVALID constraints
- **Missing constraint names**: Auto-generated names hard to manage
- **Overlapping constraints**: Multiple CHECK constraints on same column
- **Constraints without indexes**: Slow validation

**Examples**:

**Example MED**:
```sql
-- migrations/012_add_check.sql - MED: Locks table for validation!
ALTER TABLE products ADD CONSTRAINT check_price_positive CHECK (price > 0);

-- On large table:
-- - Scans all rows to validate
-- - Locks table during scan
```

**Fix - Add constraint NOT VALID first**:
```sql
-- Step 1: Add constraint without validation
ALTER TABLE products
ADD CONSTRAINT check_price_positive CHECK (price > 0) NOT VALID;

-- Step 2: Validate separately (can be done later, non-blocking)
ALTER TABLE products VALIDATE CONSTRAINT check_price_positive;
-- Uses ShareUpdateExclusiveLock instead of AccessExclusiveLock
```

## 7. Migration Ordering and Dependencies

**What to look for**:

- **Out-of-order migrations**: Migration depends on future migration
- **Missing dependencies**: Migrations run in wrong order
- **Timestamp collisions**: Multiple migrations with same timestamp
- **Cross-database dependencies**: Migrations depending on other DB state

**Examples**:

**Example HIGH**:
```sql
-- migrations/013_add_fk.sql - HIGH: References table that doesn't exist yet!
ALTER TABLE orders
ADD CONSTRAINT fk_status
FOREIGN KEY (status_id) REFERENCES order_statuses(id);

-- But order_statuses created in migration 014!
-- Migration fails if run out of order
```

**Fix**:
```sql
-- Rename migrations to correct order:
-- 013_create_statuses_table.sql
-- 014_add_status_fk.sql

-- Or add explicit dependency check:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'order_statuses') THEN
    RAISE EXCEPTION 'order_statuses table must exist first';
  END IF;
END $$;
```

## 8. Default Values and Auto-increment

**What to look for**:

- **Expensive defaults**: DEFAULT with function calls
- **DEFAULT causing rewrites**: Adding DEFAULT to existing column
- **Sequence gaps**: Missing nextval() in multi-step migrations
- **UUID generation**: Using UUIDv4 vs UUIDv7 for sortability

**Examples**:

**Example MED (PostgreSQL)**:
```sql
-- migrations/015_add_created_at.sql - MED: Expensive default!
ALTER TABLE orders ADD COLUMN created_at TIMESTAMP DEFAULT NOW();

-- PostgreSQL: Fast, stores DEFAULT in catalog
-- MySQL < 8.0: REWRITES ENTIRE TABLE!
```

**Fix for MySQL**:
```sql
-- Step 1: Add column without default
ALTER TABLE orders ADD COLUMN created_at TIMESTAMP;

-- Step 2: Backfill existing rows
UPDATE orders SET created_at = NOW() WHERE created_at IS NULL;

-- Step 3: Set default for future inserts
ALTER TABLE orders ALTER COLUMN created_at SET DEFAULT NOW();
```

## 9. Enum and Type Changes

**What to look for**:

- **Adding enum values**: Position-dependent in some databases
- **Removing enum values**: Data referencing removed value
- **Changing enum to string**: Migration strategy
- **Custom type modifications**: Requires type recreation

**Examples**:

**Example MED (PostgreSQL)**:
```sql
-- migrations/016_add_enum_value.sql - MED: Locks type!
ALTER TYPE order_status ADD VALUE 'refunded';

-- In transaction: Locks the type
-- Can't be rolled back within transaction
```

**Fix**:
```sql
-- PostgreSQL 12+: Can add enum values without transaction lock
-- Run outside transaction:
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'refunded';

-- Or better: Use VARCHAR instead of ENUM for flexibility
-- Then use CHECK constraint:
ALTER TABLE orders ADD CONSTRAINT valid_status
CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'refunded'));
```

## 10. Partitioning and Sharding

**What to look for**:

- **Adding partitioning to existing table**: Requires table recreation
- **Missing partition keys in indexes**: Slow partition pruning
- **Partition overflow**: Data outside partition ranges
- **Missing partition maintenance**: No automated partition creation

**Examples**:

**Example HIGH**:
```sql
-- migrations/017_partition_orders.sql - HIGH: Requires table recreation!
ALTER TABLE orders PARTITION BY RANGE (created_at);

-- Can't partition existing table in PostgreSQL!
-- Requires:
-- 1. Create new partitioned table
-- 2. Copy all data
-- 3. Swap tables
-- 4. Drop old table
-- = Hours of downtime on large tables
```

**Fix - Partition from the start or use partman**:
```sql
-- Better: Create partitioned from the start:
CREATE TABLE orders (
  id BIGSERIAL,
  created_at TIMESTAMP NOT NULL,
  ...
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2024_01 PARTITION OF orders
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

-- Or use pg_partman for automated partition management
```

# WORKFLOW

Read the intake and plan artifacts for the workflow to learn the intent of the change. Take the review scope and the diff from the dispatch prompt, per [_stage.md](_stage.md). Hunt defects with the checklist in this file. Record `file:line` evidence for every finding.

# OUTPUT

Write the findings file, the sibling `.yaml`, and the fragment per the output contract in [_stage.md](_stage.md). Use this skeleton for each detailed finding:

```markdown
### {ID}: {Title} [{SEVERITY}]
**Location:** `{file}:{line-range}`
**Evidence:** {quoted snippet}
**Issue:** {description}
**Fix:** {suggestion for HIGH and above}
**Severity:** {level} | **Confidence:** {High/Med/Low}
```
