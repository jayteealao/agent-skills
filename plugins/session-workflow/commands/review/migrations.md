---
name: review:migrations
description: Review database migrations for safety, compatibility, and operability in production
usage: /review:migrations [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter migration files (e.g., "migrations/**/*.sql")'
    required: false
  - name: CONTEXT
    description: 'Additional context: DB type, deployment style, online migration requirements, table sizes'
    required: false
examples:
  - command: /review:migrations pr 123
    description: Review PR #123 for migration safety issues
  - command: /review:migrations worktree "migrations/**"
    description: Review migration files for production safety
  - command: /review:migrations diff main..feature "CONTEXT: PostgreSQL 14, blue-green deployment, zero-downtime required, users table 10M rows"
    description: Review migrations with production context
---

# Database Migration Review

You are a database migration reviewer ensuring schema/data migrations are safe, compatible, and operable in real deployments.

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
| add-user-roles  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-user-roles`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed migration files in the specified PR
  - Requires `TARGET` = PR number
  - Use `gh pr diff <PR>` to get changes

- **`worktree`**: Review uncommitted migration changes
  - Use `git diff HEAD` for unstaged changes
  - Use `git diff --cached` for staged changes

- **`diff`**: Review diff between two refs
  - Requires `TARGET` = `ref1..ref2` (e.g., `main..feature-branch`)
  - Use `git diff ref1..ref2`

- **`file`**: Review specific migration file(s)
  - Requires `TARGET` = file path(s)
  - Read full migration content

- **`repo`**: Review all migration files
  - Analyze migration history and consistency

If `PATHS` is provided, filter to matching migration files.

## Step 2: Extract Migration Files

For each file in scope:

1. **Identify migration type**:
   - Schema migrations (DDL: CREATE, ALTER, DROP)
   - Data migrations (DML: INSERT, UPDATE, DELETE)
   - Mixed migrations (both DDL and DML)

2. **Read full migration** (not just diff):
   - Up migration (forward)
   - Down migration (rollback)
   - Any associated app code changes

3. **Identify affected tables**:
   - Which tables are modified?
   - What are the table sizes? (from CONTEXT or estimate)
   - What are the access patterns? (read-heavy, write-heavy)

**Critical**: Always read the **complete migration file** and **related app code** to understand full impact.

## Step 3: Parse CONTEXT (if provided)

Extract migration expectations from `CONTEXT` parameter:

- **Database type**: PostgreSQL, MySQL, MongoDB, etc. (different safety rules)
- **Deployment style**: Rolling, blue-green, canary (affects compatibility requirements)
- **Online requirements**: Zero-downtime required? Maintenance window available?
- **Table sizes**: Number of rows per table (affects locking and backfill time)
- **Replication**: Primary-replica setup? Read replicas?

Example:
```
CONTEXT: PostgreSQL 14, blue-green deployment, zero-downtime required, users table 10M rows, orders table 50M rows, primary with 3 read replicas
```

## Step 4: Migration Safety Checklist Review

For each migration, systematically check:

### 4.1 Backward/Forward Compatibility
- [ ] Old app version works with new schema (during rollout)?
- [ ] New app version works with old schema (before migration)?
- [ ] Compatible with rolling deployment (mixed versions)?
- [ ] Migration reversible (rollback safe)?

**Deployment compatibility:**
```
Rolling deployment timeline:
T0: Old app (v1) + Old schema
T1: Old app (v1) + New schema (migration runs)
T2: Mixed app (v1 + v2) + New schema (rolling update)
T3: New app (v2) + New schema

Must work at all stages!

Blue-green deployment timeline:
T0: Blue (Old app + Old schema)
T1: Green (New app + New schema) - migration runs on Green DB
T2: Switch traffic to Green
T3: Blue decommissioned

Green must work immediately after migration.
```

**Red flags:**
- Migration removes column still used by old app code
- Migration renames column without app supporting both names
- Migration adds non-null column without default
- Migration changes data format without app handling both

**Compatibility examples:**
```sql
-- ❌ BAD: Removes column (breaks old app during rollout)
ALTER TABLE users DROP COLUMN email;

-- Old app (v1) code:
SELECT id, name, email FROM users;  -- ❌ Column 'email' doesn't exist

-- ✅ GOOD: Add new column, keep old (expand phase)
-- Migration 1: Add new column
ALTER TABLE users ADD COLUMN email_address VARCHAR(255);

-- Deploy app v2 (writes to both email and email_address)
INSERT INTO users (name, email, email_address)
VALUES ('Alice', 'alice@example.com', 'alice@example.com');

-- Migration 2 (later): Backfill old rows
UPDATE users SET email_address = email WHERE email_address IS NULL;

-- Migration 3 (even later): Drop old column (contract phase)
ALTER TABLE users DROP COLUMN email;

-- ❌ BAD: Renames column (breaks old app)
ALTER TABLE users RENAME COLUMN status TO user_status;

-- Old app:
UPDATE users SET status = 'active' WHERE id = 123;  -- ❌ Column 'status' doesn't exist

-- ✅ GOOD: Add new column, keep old, write to both
-- Step 1: Add new column
ALTER TABLE users ADD COLUMN user_status VARCHAR(50);

-- Step 2: Deploy app writing to both
UPDATE users SET status = 'active', user_status = 'active' WHERE id = 123;

-- Step 3: Backfill
UPDATE users SET user_status = status WHERE user_status IS NULL;

-- Step 4: Deploy app reading from new column
SELECT id, name, user_status FROM users;

-- Step 5: Drop old column
ALTER TABLE users DROP COLUMN status;
```

### 4.2 Locking & Performance Impact
- [ ] Migration avoids long-running table locks?
- [ ] No full table rewrites on large tables?
- [ ] Index builds use CONCURRENTLY (PostgreSQL)?
- [ ] Foreign key checks deferred (MySQL)?
- [ ] Migration can complete in reasonable time (<5 min)?

**Database-specific locking:**

**PostgreSQL:**
```sql
-- ❌ BAD: Acquires ACCESS EXCLUSIVE lock (blocks all reads/writes)
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '';
-- Rewrites entire table for 10M rows → 5+ minutes of downtime

-- ✅ GOOD: Add column with NULL, then backfill
-- Step 1: Add nullable column (fast, no rewrite)
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
-- Takes milliseconds, no table rewrite

-- Step 2: Backfill in batches (app code or separate migration)
-- See 4.4 Data Backfills

-- Step 3: Add NOT NULL constraint (fast after backfill)
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- ❌ BAD: Creates index without CONCURRENTLY (blocks writes)
CREATE INDEX idx_users_email ON users(email);
-- Acquires SHARE lock, blocks INSERT/UPDATE/DELETE

-- ✅ GOOD: Build index concurrently
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
-- Allows concurrent writes, but takes longer to build

-- ❌ BAD: Adds foreign key immediately (locks both tables)
ALTER TABLE orders ADD CONSTRAINT fk_orders_users
  FOREIGN KEY (user_id) REFERENCES users(id);
-- Acquires SHARE lock on users table

-- ✅ GOOD: Add constraint as NOT VALID, then validate
-- Step 1: Add constraint without validation (fast)
ALTER TABLE orders ADD CONSTRAINT fk_orders_users
  FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;

-- Step 2: Validate constraint (uses SHARE UPDATE EXCLUSIVE, less restrictive)
ALTER TABLE orders VALIDATE CONSTRAINT fk_orders_users;
```

**MySQL:**
```sql
-- ❌ BAD: Adds non-null column (full table copy)
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '';
-- Copies entire table for 10M rows → 10+ minutes

-- ✅ GOOD: Add nullable, backfill, then NOT NULL
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL;
-- Uses INPLACE algorithm (fast)

-- MySQL 8.0: Check algorithm
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NULL,
  ALGORITHM=INPLACE, LOCK=NONE;

-- ❌ BAD: Changes column type (full table rebuild)
ALTER TABLE users MODIFY COLUMN age BIGINT;

-- ✅ GOOD: Use online DDL when possible
ALTER TABLE users MODIFY COLUMN age BIGINT,
  ALGORITHM=INPLACE, LOCK=NONE;
-- Only works for certain type changes
```

### 4.3 Default Values & Nullability
- [ ] Adding non-null columns uses safe pattern?
- [ ] Default values don't cause table rewrites?
- [ ] Backfill strategy for NULL → NOT NULL transition?
- [ ] Check constraints added safely?

**Safe patterns:**
```sql
-- ❌ BAD: Add NOT NULL with DEFAULT immediately
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '';
-- PostgreSQL: Rewrites table (10M rows → 5+ min downtime)
-- MySQL: Copies table (10M rows → 10+ min downtime)

-- ✅ GOOD: Three-step approach (PostgreSQL)
-- Step 1: Add nullable column
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
-- Fast (milliseconds), no rewrite

-- Step 2: Set default for future rows
ALTER TABLE users ALTER COLUMN phone SET DEFAULT '';
-- Fast, only affects new rows

-- Step 3: Backfill existing rows (see 4.4)
-- Run in batches to avoid long locks

-- Step 4: Add NOT NULL constraint
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
-- Fast if all rows have values

-- ✅ BETTER: PostgreSQL 11+ optimization
-- If default is constant, PostgreSQL 11+ doesn't rewrite table
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '';
-- Check your PostgreSQL version!

-- For older PostgreSQL:
-- Step 1: Add with default
ALTER TABLE users ADD COLUMN phone VARCHAR(20) DEFAULT '';

-- Step 2: Remove default (so future inserts must specify)
ALTER TABLE users ALTER COLUMN phone DROP DEFAULT;

-- Step 3: Add NOT NULL
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- ❌ BAD: Add CHECK constraint immediately (validates all rows)
ALTER TABLE users ADD CONSTRAINT check_age_positive
  CHECK (age > 0);
-- Scans entire table

-- ✅ GOOD: Add constraint as NOT VALID, then validate
-- PostgreSQL only:
ALTER TABLE users ADD CONSTRAINT check_age_positive
  CHECK (age > 0) NOT VALID;
-- Doesn't validate existing rows

-- Step 2: Validate constraint
ALTER TABLE users VALIDATE CONSTRAINT check_age_positive;
-- Validates existing rows with SHARE UPDATE EXCLUSIVE lock (less restrictive)
```

### 4.4 Data Backfills
- [ ] Backfill chunked into small batches?
- [ ] Backfill has progress tracking?
- [ ] Backfill is idempotent (safe to retry)?
- [ ] Backfill has reasonable timeout per batch?
- [ ] Long-running backfills run outside migration transaction?

**Red flags:**
- Single UPDATE affecting 10M+ rows
- No WHERE clause limiting batch size
- Backfill in same transaction as schema change
- No way to monitor progress

**Backfill patterns:**
```sql
-- ❌ BAD: Backfill all rows in one statement
UPDATE users SET email_address = email WHERE email_address IS NULL;
-- 10M rows updated in single transaction
-- Holds locks for minutes
-- Cannot track progress
-- Cannot resume if it fails

-- ✅ GOOD: Chunked backfill with progress tracking
-- Run as separate script (not in migration transaction)

-- Script: backfill_email_address.sql
DO $$
DECLARE
  batch_size INT := 10000;
  rows_updated INT;
  total_updated INT := 0;
  start_id BIGINT := 0;
BEGIN
  LOOP
    -- Update batch (with ID range for resumability)
    UPDATE users
    SET email_address = email
    WHERE id > start_id
      AND email_address IS NULL
      AND id IN (
        SELECT id FROM users
        WHERE id > start_id AND email_address IS NULL
        ORDER BY id
        LIMIT batch_size
      );

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    total_updated := total_updated + rows_updated;

    -- Progress logging
    RAISE NOTICE 'Updated % rows (total: %)', rows_updated, total_updated;

    -- Exit if no more rows
    EXIT WHEN rows_updated = 0;

    -- Get next start_id
    SELECT MAX(id) INTO start_id FROM users WHERE email_address IS NOT NULL;

    -- Commit batch (release locks)
    COMMIT;

    -- Sleep to reduce load (optional)
    PERFORM pg_sleep(0.1);
  END LOOP;

  RAISE NOTICE 'Backfill complete. Total rows updated: %', total_updated;
END $$;

-- Alternative: Application-level backfill (better for huge tables)
-- backfill.ts
async function backfillEmailAddress() {
  const batchSize = 10000;
  let lastId = 0;
  let totalUpdated = 0;

  while (true) {
    const rows = await db.query(`
      SELECT id, email
      FROM users
      WHERE id > $1 AND email_address IS NULL
      ORDER BY id
      LIMIT $2
    `, [lastId, batchSize]);

    if (rows.length === 0) break;

    // Update batch
    for (const row of rows) {
      await db.query(
        'UPDATE users SET email_address = $1 WHERE id = $2',
        [row.email, row.id]
      );
    }

    lastId = rows[rows.length - 1].id;
    totalUpdated += rows.length;

    console.log(`Updated ${rows.length} rows (total: ${totalUpdated})`);

    // Sleep to reduce load
    await sleep(100);
  }

  console.log(`Backfill complete. Total: ${totalUpdated}`);
}

-- Monitoring backfill progress:
SELECT
  COUNT(*) FILTER (WHERE email_address IS NOT NULL) AS backfilled,
  COUNT(*) FILTER (WHERE email_address IS NULL) AS remaining,
  COUNT(*) AS total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE email_address IS NOT NULL) / COUNT(*), 2) AS percent_complete
FROM users;
```

### 4.5 Rollback Safety
- [ ] Rollback/down migration provided?
- [ ] Rollback tested?
- [ ] Irreversible operations clearly documented?
- [ ] Data loss risk in rollback documented?
- [ ] Rollback can run safely after partial deployment?

**Red flags:**
- No down migration
- Down migration drops column with data
- Irreversible data transformation (no backup)
- Rollback not idempotent

**Rollback patterns:**
```sql
-- ❌ BAD: Irreversible migration (no rollback)
-- up.sql
ALTER TABLE users DROP COLUMN email;
-- Data lost forever!

-- down.sql
-- ??? Cannot restore dropped data

-- ✅ GOOD: Reversible migration with safety checks
-- up.sql (expand phase)
ALTER TABLE users ADD COLUMN email_address VARCHAR(255);

-- down.sql
ALTER TABLE users DROP COLUMN email_address;
-- Safe: email_address is new column, no data loss

-- ⚠️ ACCEPTABLE: Irreversible if documented
-- up.sql
ALTER TABLE users DROP COLUMN legacy_field;

-- down.sql
-- IRREVERSIBLE: Cannot restore legacy_field data
-- If rollback needed, restore from backup before this migration
RAISE EXCEPTION 'Cannot rollback: data loss. Restore from backup.';

-- ❌ BAD: Rollback loses data
-- up.sql
UPDATE users SET status = UPPER(status);  -- 'active' → 'ACTIVE'

-- down.sql
UPDATE users SET status = LOWER(status);  -- 'ACTIVE' → 'active'
-- ❌ Assumes all statuses were lowercase originally (might not be true)

-- ✅ GOOD: Preserve original data during transformation
-- up.sql
-- Step 1: Add new column
ALTER TABLE users ADD COLUMN status_v2 VARCHAR(50);

-- Step 2: Transform data (keeping original)
UPDATE users SET status_v2 = UPPER(status);

-- down.sql
ALTER TABLE users DROP COLUMN status_v2;
-- Original status column unchanged, safe rollback

-- ✅ GOOD: Idempotent rollback
-- up.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- down.sql
ALTER TABLE users DROP COLUMN IF EXISTS phone;
-- Safe to run multiple times
```

### 4.6 Expand/Contract Pattern
- [ ] Schema changes follow expand/contract discipline?
- [ ] Expand phase: Add new columns/tables (compatible with old app)
- [ ] Transition phase: App writes to both old and new
- [ ] Backfill phase: Populate new schema from old
- [ ] Switch phase: App reads from new schema
- [ ] Contract phase: Remove old columns/tables

**Expand/contract workflow:**
```
Example: Rename users.email → users.email_address

Phase 1: EXPAND (add new column)
┌─────────────────────────────────────────┐
│ Migration 1: Add new column             │
│ ALTER TABLE users                       │
│   ADD COLUMN email_address VARCHAR(255) │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ App v1 (old)                            │
│ - Reads from: email                     │
│ - Writes to: email                      │
└─────────────────────────────────────────┘

Phase 2: TRANSITION (write to both)
┌─────────────────────────────────────────┐
│ App v2 (transition)                     │
│ - Reads from: email (old column)        │
│ - Writes to: email + email_address      │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Migration 2: Backfill                   │
│ UPDATE users                            │
│   SET email_address = email             │
│   WHERE email_address IS NULL           │
└─────────────────────────────────────────┘

Phase 3: SWITCH (read from new)
┌─────────────────────────────────────────┐
│ App v3 (switch)                         │
│ - Reads from: email_address (new!)      │
│ - Writes to: email + email_address      │
└─────────────────────────────────────────┘

Phase 4: CONTRACT (remove old)
┌─────────────────────────────────────────┐
│ App v4 (final)                          │
│ - Reads from: email_address             │
│ - Writes to: email_address              │
└─────────────────────────────────────────┘
                  ↓
┌─────────────────────────────────────────┐
│ Migration 3: Drop old column            │
│ ALTER TABLE users DROP COLUMN email     │
└─────────────────────────────────────────┘

Timeline:
Day 0: Deploy app v2 + migration 1 (expand)
Day 1: Migration 2 runs (backfill)
Day 2: Deploy app v3 (switch)
Day 7: Deploy app v4 + migration 3 (contract)

Each phase is separately deployable and rollback-safe!
```

**Anti-pattern:**
```sql
-- ❌ BAD: Rename in single migration (breaks compatibility)
BEGIN;
ALTER TABLE users RENAME COLUMN email TO email_address;
COMMIT;

-- Old app (v1) deployed:
SELECT id, email FROM users;  -- ❌ Column doesn't exist
-- Instant production outage!

-- ✅ GOOD: Expand/contract over multiple deployments
-- See workflow above
```

### 4.7 Production Safety
- [ ] Migration runs in transaction (when appropriate)?
- [ ] Statement timeout set (prevents indefinite locks)?
- [ ] Lock timeout set (fails fast if cannot acquire lock)?
- [ ] Migration ordering correct (dependencies respected)?
- [ ] Permissions sufficient (app user can run migration)?
- [ ] Database-specific safe statements used?

**Transaction boundaries:**
```sql
-- ✅ GOOD: Transactional DDL (PostgreSQL)
BEGIN;

ALTER TABLE users ADD COLUMN phone VARCHAR(20);
ALTER TABLE users ADD COLUMN address TEXT;

-- If any statement fails, all are rolled back
COMMIT;

-- ⚠️ CAUTION: Long-running backfills should NOT be in transaction
-- Run backfills outside transaction to avoid holding locks

-- ❌ BAD: Backfill in transaction
BEGIN;
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
UPDATE users SET phone = '';  -- 10M rows!
COMMIT;
-- Holds locks for entire duration

-- ✅ GOOD: Schema change in transaction, backfill separate
-- migration_001_add_phone.sql
BEGIN;
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
COMMIT;

-- backfill_phone.sql (run separately)
-- Chunked backfill as shown in 4.4
```

**Timeouts:**
```sql
-- ✅ GOOD: Set timeouts to prevent indefinite waits
-- PostgreSQL
SET statement_timeout = '5min';  -- Kill query after 5 minutes
SET lock_timeout = '10s';        -- Fail if cannot acquire lock in 10 seconds

BEGIN;

-- Try to acquire lock
ALTER TABLE users ADD COLUMN phone VARCHAR(20);
-- If lock not available in 10s, migration fails immediately
-- If query takes >5 min, killed automatically

COMMIT;

-- Reset timeouts
SET statement_timeout = DEFAULT;
SET lock_timeout = DEFAULT;

-- MySQL
SET SESSION max_execution_time = 300000;  -- 5 minutes in milliseconds

ALTER TABLE users ADD COLUMN phone VARCHAR(20);
```

**Migration ordering:**
```sql
-- ❌ BAD: Migrations out of order
-- migration_002.sql
ALTER TABLE orders ADD CONSTRAINT fk_orders_users
  FOREIGN KEY (user_id) REFERENCES users(id);

-- migration_001.sql (runs after!)
CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  name VARCHAR(100)
);

-- ERROR: Table "users" does not exist

-- ✅ GOOD: Correct ordering with dependencies
-- migrations/
--   001_create_users.sql
--   002_create_orders.sql
--   003_add_foreign_key.sql

-- Use timestamp or sequence numbers to ensure order
```

## Step 5: Generate Findings

For **each migration safety issue** found, create a finding with:

### Finding Format

```markdown
### MG-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `migrations/XXX_migration_name.sql:45`
```sql
[exact migration code showing the issue]
```

**Migration Safety Violation:**
- **Safety Principle:** [Which principle is violated?]
- **Production Impact:** [What happens in production?]
- **Table Size:** [Affected table size from CONTEXT]
- **Downtime Risk:** [Estimated downtime or lock duration]

**Deployment Scenario:**
```
Timeline:
T0: [Old app + old schema state]
T1: [Migration runs]
T2: [App deployment state]
T3: [Problem occurs]

Problem:
- [Concrete issue that will occur]
- [User impact]
- [Recovery steps]
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```sql
-- ❌ BEFORE (unsafe migration)
[current migration code]

-- ✅ AFTER (safe migration)
[fixed migration code with expand/contract if needed]
```

**Why This Fix:**
[Explain how this makes migration safe for zero-downtime deployment]

**Deployment Steps:**
```
[Step-by-step deployment plan if multi-phase]
```
```

### Severity Guidelines

- **BLOCKER**: Migration will cause production outage or data loss
  - Example: Drops column still used by running app
  - Example: Long-running lock (>1 min) on high-traffic table

- **HIGH**: Significant downtime or data integrity risk
  - Example: Full table rewrite on 10M+ row table
  - Example: Missing NOT NULL safety pattern

- **MED**: Suboptimal but workable, or requires careful timing
  - Example: No down migration provided
  - Example: Backfill not chunked (but table is small)

- **LOW**: Minor issue or best practice violation
  - Example: Could add IF EXISTS for idempotency
  - Example: Could set explicit timeout

- **NIT**: Stylistic or organizational
  - Example: Migration file naming could be clearer

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with deployment details:

1. **Check table sizes**
   - Example: "users table 10M rows" → ALTER with NOT NULL = BLOCKER

2. **Validate deployment style**
   - Example: "blue-green deployment" → check compatibility

3. **Verify online requirements**
   - Example: "zero-downtime required" → check for locks

4. **Database-specific rules**
   - Example: "PostgreSQL 14" → can use NOT VALID constraints

## Step 7: Migration Safety Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** for production:

1. **Dropping columns/tables still in use** by running app
2. **Long-running locks** (>1 min) on tables with active traffic
3. **Non-chunked backfills** on tables with 1M+ rows
4. **Adding NOT NULL without default** immediately (causes table rewrite)
5. **Irreversible data transformations** without backup strategy
6. **Creating indexes without CONCURRENTLY** (PostgreSQL) on large tables

## Step 8: Estimate Migration Impact

For each migration, estimate:

1. **Lock duration**: How long are locks held?
2. **Downtime risk**: Will this cause downtime?
3. **Rollout time**: How long for expand/contract phases?
4. **Backfill time**: How long to backfill data?

**Impact calculation:**
```
Example: Add NOT NULL column to 10M row table

❌ Unsafe approach:
ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '';

Impact:
- Table rewrite: 10M rows × 500 bytes = 5GB
- Write time: 5GB / 50 MB/s = 100 seconds
- Lock held: ACCESS EXCLUSIVE for 100 seconds
- Downtime: 100 seconds
- Verdict: BLOCKER (unacceptable)

✅ Safe approach:
1. ADD COLUMN phone VARCHAR(20) NULL - 50ms (no rewrite)
2. Backfill in batches (10k rows per batch) - 1000 batches
   - Per batch: 100ms
   - Total: 100 seconds (but locks released between batches)
   - Downtime: 0 seconds
3. SET NOT NULL - 50ms
- Verdict: Acceptable (zero downtime)
```

## Step 9: Write Migration Review Report

Create `.claude/<SESSION_SLUG>/reviews/migrations.md`:

```markdown
# Database Migration Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## Migration Impact Assessment

### Affected Tables
| Table | Size | Migration Type | Lock Duration | Downtime Risk |
|-------|------|----------------|---------------|---------------|
| users | 10M rows | ADD COLUMN | <100ms | None |
| orders | 50M rows | ADD INDEX | 5-10 min | None (CONCURRENTLY) |

### Estimated Timeline
- **Schema changes:** [X minutes]
- **Backfills:** [Y minutes]
- **Total deployment:** [Z minutes across N phases]

### Compatibility
- [✅/❌] Backward compatible (old app + new schema)
- [✅/❌] Forward compatible (new app + old schema)
- [✅/❌] Rolling deployment safe
- [✅/❌] Rollback safe

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## Deployment Plan

### Phase 1: Expand (Day 0)
- Run migration: [migration file]
- Deploy app: [version]
- Compatibility: [old + new compatible]

### Phase 2: Backfill (Day 0-1)
- Run backfill script: [script]
- Monitor progress: [query]

### Phase 3: Switch (Day 2)
- Deploy app: [version]
- App now reads from new schema

### Phase 4: Contract (Day 7)
- Run migration: [migration file]
- Remove old schema

---

## Rollback Plan

### Rollback Phase 1
- Revert to app: [version]
- Run down migration: [migration file]

### Rollback Phase 2
- [Steps if in middle of backfill]

---

## Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - must fix before production]

### Short-term (HIGH)
[Actions for HIGH items - significant risk]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - best practices]

---

## Testing Checklist

- [ ] Migration runs successfully on dev
- [ ] Migration runs successfully on staging
- [ ] Down migration tested
- [ ] App v1 works with new schema (backward compat)
- [ ] App v2 works with old schema (forward compat)
- [ ] Backfill completes in reasonable time
- [ ] No unexpected locks held
- [ ] Performance impact measured

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide migration context I may have missed
```

## Step 10: Output Summary

Print to console:

```
🔍 Database Migration Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

⏱️  Estimated impact: X minutes downtime risk

📝 Full report: .claude/<SESSION_SLUG>/reviews/migrations.md

⚠️  BLOCKER items: [list titles]
```

---

## Example Findings

[Continue with 5-7 detailed example findings covering:
1. Unsafe ADD COLUMN NOT NULL (causes table rewrite)
2. Missing CONCURRENTLY on index creation
3. Dropping column still used by old app
4. Non-chunked backfill on large table
5. No down migration provided
6. Foreign key without NOT VALID
7. Expand/contract pattern violation]

---

## Notes

- **Read full migrations**: Always read complete migration files, not just diffs
- **Check table sizes**: Large tables need special handling (CONCURRENTLY, chunking)
- **Test compatibility**: Verify old app + new schema works (and vice versa)
- **Evidence-first**: Every finding must have file:line + migration code
- **Actionable remediation**: Provide complete before/after with deployment plan
- **Cross-reference CONTEXT**: Use table sizes and deployment style to assess impact
- **False positives welcome**: Encourage users to challenge migration interpretations
