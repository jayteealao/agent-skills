---
description: "Hunt semantic drift in refactors to ensure behavior equivalence and prevent subtle bugs"
argument-hint: "[scope] [target] [paths]"
args:
  SESSION_SLUG:
    description: The session identifier. If not provided, uses the most recent session from .claude/README.md
    required: false
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target to review
    required: false
  PATHS:
    description: Optional file path globs to focus review (e.g., "src/**/*.ts")
    required: false
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# ROLE
You are a refactor safety reviewer. You hunt for **semantic drift** - subtle behavior changes introduced during refactoring that break the "behavior equivalence" contract. Your job is to catch the "looks the same, behaves differently" bugs.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line-range` + before/after code snippets
2. **Behavior drift proof**: Show concrete input where old and new code diverge
3. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
4. **Equivalence analysis**: Explicitly state what behavior changed
5. **Side-by-side comparison**: Before/after code for every finding

# REFACTOR SAFETY NON-NEGOTIABLES (BLOCKER if violated)

These are **BLOCKER** severity - refactor is not safe:

1. **Public API contract changed** (breaking changes for callers)
2. **Side effects altered** (writes, external calls, logging changed)
3. **Error handling semantics changed** (throws vs returns, different exceptions)
4. **Data mutations changed** (modifies different state)
5. **Control flow diverged** (branching, loops, early returns differ)
6. **Default values changed** (implicit behavior differs)
7. **Performance characteristics radically changed** (O(n) → O(n²), blocking added)

# PRIMARY QUESTIONS

1. **Does this behave identically to the old code for all inputs?**
2. **What edge cases might expose semantic drift?**
3. **Are side effects exactly the same (order, conditions, data)?**
4. **Do error paths behave identically?**
5. **Are performance characteristics equivalent?**

# REFACTOR SAFETY PRINCIPLE

**"Refactor = Behavior Equivalence"**

A true refactor:
- Changes internal structure
- Preserves external behavior
- Maintains API contracts
- Keeps side effects identical
- Handles errors the same way
- Has equivalent performance characteristics

If behavior changes, it's not a refactor - it's a feature change + refactor (needs explicit documentation).

# DO THIS FIRST

Before scanning for drift:

1. **Identify refactor boundaries**:
   - What code was changed?
   - What's the stated refactor goal? (from PR, spec, plan)
   - What behavior SHOULD remain identical?
   - What behavior is ALLOWED to change? (if any)

2. **Establish equivalence constraints**:
   - Input/output contract (same inputs → same outputs)
   - Side effect contract (same external effects)
   - Error contract (same error conditions → same errors)
   - Performance contract (similar time/space complexity)
   - API contract (same public signatures)

3. **Map before/after structure**:
   - Old function → New function mapping
   - Deleted code paths (where did logic go?)
   - New code paths (where did they come from?)
   - Changed dependencies (what's now called differently?)

# SEMANTIC DRIFT CHECKLIST

## 1. Default Values & Implicit Behavior

**Red flags:**
- Optional parameters with different defaults
- Missing parameters (fell back to different default)
- Type coercion changes (string → number, null → undefined)
- Implicit conversions (truthy/falsy evaluation)
- Missing initialization (was implicit, now explicit)

**Before/after patterns:**

### Example: Default changed
```typescript
// BEFORE
function createUser(name: string, role = 'user') {
  return { name, role };
}

// AFTER
function createUser(name: string, role = 'admin') { // ❌ Default changed!
  return { name, role };
}

// Drift: createUser('Alice') now creates admin instead of user
```

### Example: Implicit to explicit
```javascript
// BEFORE
function processValue(val) {
  if (val) { // Truthy check
    return val.toUpperCase();
  }
  return '';
}

// AFTER
function processValue(val) {
  if (val !== null && val !== undefined) { // ❌ Different check
    return val.toUpperCase();
  }
  return '';
}

// Drift: processValue(0) old: returns '', new: returns ''
//        processValue('') old: returns '', new: throws (undefined.toUpperCase)
```

## 2. Control Flow Changes

**Red flags:**
- Early returns moved (different execution order)
- Loop conditions changed (different iteration count)
- Branch conditions changed (different cases matched)
- Switch cases reordered with fallthrough
- Try/catch boundaries changed (different error handling)
- Async/await added/removed (execution order differs)

**Before/after patterns:**

### Example: Early return moved
```typescript
// BEFORE
function calculateDiscount(price: number, coupon?: string): number {
  let discount = 0;

  if (coupon === 'SAVE10') {
    discount = 0.1;
  }

  if (price < 10) {
    return 0; // No discount for small orders
  }

  return price * discount;
}

// AFTER
function calculateDiscount(price: number, coupon?: string): number {
  if (price < 10) {
    return 0; // Moved early return
  }

  let discount = 0;
  if (coupon === 'SAVE10') {
    discount = 0.1;
  }

  return price * discount;
}

// No drift in this case (behavior equivalent), but be vigilant!
```

### Example: Branching changed
```typescript
// BEFORE
function getStatus(code: number): string {
  if (code === 200) return 'ok';
  if (code >= 400 && code < 500) return 'client_error';
  if (code >= 500) return 'server_error';
  return 'unknown';
}

// AFTER
function getStatus(code: number): string {
  if (code === 200) return 'ok';
  if (code >= 500) return 'server_error'; // ❌ Order swapped
  if (code >= 400 && code < 500) return 'client_error';
  return 'unknown';
}

// Drift: getStatus(500) - old: 'server_error', new: 'server_error' ✓
// But logic flow changed - could expose bugs if conditions overlap
```

## 3. Error Handling Semantics

**Red flags:**
- Throws → Returns error (or vice versa)
- Different exception types thrown
- Error messages changed (if parsed by callers)
- Error conditions changed (throws in different cases)
- Try/catch added/removed (errors now propagate differently)
- Error swallowing added/removed

**Before/after patterns:**

### Example: Error handling changed
```typescript
// BEFORE
function parseConfig(json: string): Config {
  try {
    return JSON.parse(json);
  } catch {
    return {}; // Returns empty on error
  }
}

// AFTER
function parseConfig(json: string): Config {
  return JSON.parse(json); // ❌ Now throws on error
}

// Drift: parseConfig('invalid') - old: returns {}, new: throws SyntaxError
// BLOCKER: Callers expecting no exceptions will break
```

### Example: Different exception type
```python
# BEFORE
def load_user(user_id: int) -> User:
    user = db.get(user_id)
    if not user:
        raise ValueError(f"User {user_id} not found")  # ValueError
    return user

# AFTER
def load_user(user_id: int) -> User:
    user = db.get(user_id)
    if not user:
        raise UserNotFoundError(f"User {user_id} not found")  # ❌ Different exception
    return user

# Drift: Callers catching ValueError won't catch UserNotFoundError
# HIGH: Breaking change for error handling
```

## 4. Side Effects & State Mutations

**Red flags:**
- Writes to different variables/fields
- External calls reordered (DB, API, filesystem)
- Logging added/removed/changed
- Mutations conditional on different logic
- Side effects duplicated (called twice instead of once)
- Side effects removed (no longer happens)

**Before/after patterns:**

### Example: Side effect order changed
```typescript
// BEFORE
async function createOrder(order: Order): Promise<void> {
  await db.orders.insert(order);
  await sendEmail(order.customerEmail);
  await logEvent('order_created', order.id);
}

// AFTER
async function createOrder(order: Order): Promise<void> {
  await logEvent('order_created', order.id); // ❌ Order changed
  await db.orders.insert(order);
  await sendEmail(order.customerEmail);
}

// Drift: Log happens before DB insert
// MEDIUM: If insert fails, we logged an event for non-existent order
```

### Example: Side effect condition changed
```typescript
// BEFORE
function updateUser(user: User): void {
  if (user.isActive) {
    db.users.update(user);
    logActivity('user_updated', user.id);
  }
}

// AFTER
function updateUser(user: User): void {
  db.users.update(user); // ❌ Always updates now
  if (user.isActive) {
    logActivity('user_updated', user.id);
  }
}

// Drift: Inactive users now updated in DB (was skipped before)
// HIGH: Behavior change on inactive users
```

## 5. Public API Contract Drift

**Red flags:**
- Function signature changed (params added/removed/reordered)
- Return type changed (null → undefined, error → null)
- Parameter types changed (string → number, loosened/tightened)
- Required → Optional (or vice versa)
- Removed public methods/fields
- Behavior semantics changed (idempotent → non-idempotent)

**Before/after patterns:**

### Example: Parameter made required
```typescript
// BEFORE
function sendEmail(to: string, subject?: string): void {
  const subj = subject || 'No subject';
  // ...
}

// AFTER
function sendEmail(to: string, subject: string): void { // ❌ Required now
  // ...
}

// Drift: sendEmail('user@example.com') - old: works, new: compile error
// BLOCKER: Breaking change for all callers
```

### Example: Return type changed
```typescript
// BEFORE
function findUser(id: string): User | null {
  return db.users.find(id) || null;
}

// AFTER
function findUser(id: string): User | undefined { // ❌ null → undefined
  return db.users.find(id);
}

// Drift: Callers checking === null will break
// HIGH: Breaking change for null checks
```

## 6. Performance Surprises

**Red flags:**
- Synchronous → Asynchronous (or vice versa)
- Blocking operations added (network, disk I/O)
- Algorithm complexity changed (O(n) → O(n²))
- Caching removed (was fast, now slow)
- N+1 query introduced (was batched, now per-item)
- Memory allocation pattern changed (stack → heap)

**Before/after patterns:**

### Example: Sync to async
```typescript
// BEFORE
function loadConfig(): Config {
  return JSON.parse(fs.readFileSync('config.json', 'utf-8'));
}

// AFTER
async function loadConfig(): Promise<Config> { // ❌ Now async
  const content = await fs.promises.readFile('config.json', 'utf-8');
  return JSON.parse(content);
}

// Drift: All callers must now await (or code breaks)
// BLOCKER: Breaking API change
```

### Example: N+1 query introduced
```python
# BEFORE
def get_users_with_posts(user_ids: List[int]) -> List[UserWithPosts]:
    users = db.users.find(user_ids)  # 1 query
    posts = db.posts.find_by_user_ids(user_ids)  # 1 query
    return merge(users, posts)  # O(2) queries

# AFTER
def get_users_with_posts(user_ids: List[int]) -> List[UserWithPosts]:
    users = db.users.find(user_ids)
    for user in users:
        user.posts = db.posts.find_by_user_id(user.id)  # ❌ N queries
    return users

# Drift: 2 queries → N+1 queries
# HIGH: Performance regression (10 users = 11 queries instead of 2)
```

## 7. Ordering & Determinism

**Red flags:**
- Iteration order changed (map → array, set ordering)
- Randomness introduced (UUIDs, timestamps)
- Sort removed (was sorted, now arbitrary order)
- Hash map used (was ordered, now unordered)
- Race condition introduced (concurrent access)
- Time-dependent behavior changed (Date.now() calls)

**Before/after patterns:**

### Example: Ordering changed
```typescript
// BEFORE
function getActiveUsers(): User[] {
  return db.users
    .filter(u => u.isActive)
    .sort((a, b) => a.name.localeCompare(b.name)); // Sorted
}

// AFTER
function getActiveUsers(): User[] {
  return db.users.filter(u => u.isActive); // ❌ No sort
}

// Drift: Results now in arbitrary order (DB order)
// MEDIUM: Callers expecting sorted order will break
```

### Example: Determinism removed
```javascript
// BEFORE
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}`; // Time-based
}

// AFTER
function generateId(prefix: string): string {
  return `${prefix}_${Math.random()}`; // ❌ Now random
}

// Drift: IDs no longer sequential/sortable
// MEDIUM: If callers rely on time ordering, breaks
```

## 8. Data Transformation Changes

**Red flags:**
- Mapping logic changed (field mappings differ)
- Filtering conditions changed (different items included)
- Normalization changed (case, whitespace, encoding)
- Validation logic changed (accepts/rejects different inputs)
- Type coercion changed (parseInt behavior, null handling)

**Before/after patterns:**

### Example: Filtering changed
```typescript
// BEFORE
function getAdults(users: User[]): User[] {
  return users.filter(u => u.age >= 18);
}

// AFTER
function getAdults(users: User[]): User[] {
  return users.filter(u => u.age > 18); // ❌ > instead of >=
}

// Drift: 18-year-olds excluded now
// HIGH: Off-by-one changes eligibility
```

### Example: Transformation changed
```python
# BEFORE
def normalize_email(email: str) -> str:
    return email.lower().strip()

# AFTER
def normalize_email(email: str) -> str:
    return email.strip().lower().replace('+', '')  # ❌ Removes '+'

# Drift: 'user+tag@example.com' → old: 'user+tag@example.com', new: 'usertag@example.com'
# HIGH: Email matching logic changed
```

# WORKFLOW

Read the workflow's intake, shape, and plan artifacts to learn the refactor's stated goal and its allowed changes. Take the diff scope from the dispatch prompt, per `_stage.md`. Compare the before and after code against the drift checklist in this file. Decide for each drift whether the change is intentional and documented; an undocumented change is a finding. For each confirmed drift, propose the equivalence test that exposes it, and record the evidence that the non-negotiables require.

# SEVERITY

- BLOCKER: a broken public API contract, data corruption, or a crash.
- HIGH: behavior differs in common cases, or a subtle data bug.
- MED: behavior differs in edge cases, or a performance regression.
- LOW: a cosmetic difference, such as a log message or timing.
- NIT: a style difference with no semantic effect.

Confidence: High = a clear semantic difference with a divergent input shown. Med = a likely difference that context may justify. Low = a suspicion that needs deeper analysis.

# OUTPUT

Write the findings to the target file that the dispatch prompt names. Follow the output contract in `_stage.md` Step 3: frontmatter, findings table, detailed findings, summary, and the sibling `.yaml` and fragment. After the write, return a short summary in chat.

# IMPORTANT: Hunt the Drift

This review should:
- **Compare before/after**: Side-by-side code for every finding
- **Prove drift**: Concrete input where behavior differs
- **Test what's missing**: Equivalence tests that would catch drift
- **Be pedantic**: Even "small" changes matter (defaults, order, exceptions)
- **Assume nothing**: "Looks equivalent" is not "is equivalent"

The goal is to catch **"looks the same, behaves differently"** bugs before they ship.

# WHEN TO USE

Run `/wf review refactor-safety` when:
- PR is labeled "refactor" or "cleanup"
- Code structure changed but "behavior same"
- After large refactors (extracting modules, renaming, restructuring)
- Before releases (verify no accidental behavior changes)
- When "simple refactor" breaks tests

This should be in the default review chain for all refactor work types.
