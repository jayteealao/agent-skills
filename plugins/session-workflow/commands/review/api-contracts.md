---
name: review:api-contracts
description: Review API contracts for stability, correctness, and usability for consumers
usage: /review:api-contracts [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., "src/api/**/*.ts")'
    required: false
  - name: CONTEXT
    description: 'Additional context: public vs internal API, versioning policy, backward-compat requirements'
    required: false
examples:
  - command: /review:api-contracts pr 123
    description: Review PR #123 for API contract issues
  - command: /review:api-contracts worktree "src/api/**"
    description: Review API layer for contract violations
  - command: /review:api-contracts diff main..feature "CONTEXT: Public API, strict backward compatibility, semantic versioning"
    description: Review branch diff with API contract constraints
---

# API Contract Review

You are an API contract reviewer ensuring interface stability, correctness, and usability for consumers.

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
| add-api-endpoint  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-api-endpoint`

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

- **`repo`**: Review entire API surface
  - Analyze all API endpoints, schemas, error responses

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Changed API Contracts

For each file in scope:

1. **Identify API changes**:
   - New endpoints, modified endpoints, removed endpoints
   - Request/response schema changes
   - Query parameters, headers, status codes
   - Error response formats

2. **Read full context** (entire endpoint definition, not just diff lines)

3. **Compare before/after**:
   - What changed in the contract?
   - Is it backward compatible?
   - Will existing clients break?

**Critical**: Always read the **complete endpoint definition** and **related schemas/types** to understand full contract.

## Step 3: Parse CONTEXT (if provided)

Extract API contract expectations from `CONTEXT` parameter:

- **API visibility**: Public API (external consumers) vs Internal API (internal services only)
- **Versioning policy**: Semantic versioning, URL versioning (/v1, /v2), header versioning
- **Backward compatibility**: Strict (no breaking changes) vs Flexible (allowed with major version bump)
- **Deprecation policy**: Sunset timeline, migration support

Example:
```
CONTEXT: Public REST API, semantic versioning, strict backward compatibility for minor versions, 6-month deprecation notice
```

## Step 4: API Contract Checklist Review

For each changed endpoint or schema, systematically check:

### 4.1 Backward Compatibility
- [ ] Existing fields not removed?
- [ ] Existing fields not renamed?
- [ ] Field types not changed (e.g., string → number)?
- [ ] Required fields not added?
- [ ] Default behavior not changed?
- [ ] Status codes not changed for existing scenarios?
- [ ] Error response format consistent?
- [ ] Query parameter meanings unchanged?

**Breaking changes:**
```typescript
// ❌ BREAKING: Removed field
// Before:
{ id: string, name: string, email: string }
// After:
{ id: string, name: string }  // ❌ email removed

// ❌ BREAKING: Renamed field
// Before:
{ userId: string }
// After:
{ user_id: string }  // ❌ Changed casing

// ❌ BREAKING: Type change
// Before:
{ age: number }
// After:
{ age: string }  // ❌ Number to string

// ❌ BREAKING: New required field
// Before:
{ name: string }
// After:
{ name: string, email: string }  // ❌ email now required

// ❌ BREAKING: Changed status code
// Before: 404 Not Found
// After: 400 Bad Request  // ❌ Changed error semantics
```

**Non-breaking changes:**
```typescript
// ✅ NON-BREAKING: Added optional field
// Before:
{ id: string, name: string }
// After:
{ id: string, name: string, email?: string }  // ✅ Optional, existing clients work

// ✅ NON-BREAKING: Added new endpoint
// Before: GET /users
// After: GET /users, GET /users/:id  // ✅ New endpoint, existing clients unaffected

// ✅ NON-BREAKING: More permissive validation
// Before: name must be 1-50 chars
// After: name must be 1-100 chars  // ✅ Accepts more, old clients work

// ✅ NON-BREAKING: New optional query parameter
// Before: GET /users
// After: GET /users?filter=active  // ✅ Optional, default behavior unchanged
```

### 4.2 Validation & Schema
- [ ] Required vs optional fields clearly defined?
- [ ] Constraints documented (min/max length, range, pattern)?
- [ ] Unknown field handling consistent (ignore vs reject)?
- [ ] Null vs undefined handling clear?
- [ ] Array validation (min/max items)?
- [ ] Enum values documented?

**Red flags:**
- Fields without type information
- Inconsistent `required` specification
- No validation for user input
- Undocumented constraints
- Ambiguous null handling

**Validation examples:**
```typescript
// ❌ BAD: Unclear validation
interface CreateUserRequest {
  name: string;       // ❌ How long? Can be empty?
  email: string;      // ❌ Valid email format?
  age: number;        // ❌ Range? Can be negative?
  roles: string[];    // ❌ How many? Can be empty?
}

// ✅ GOOD: Clear validation
interface CreateUserRequest {
  /**
   * User's full name
   * - Required
   * - Min length: 1, Max length: 100
   * - Pattern: Unicode letters, spaces, hyphens
   */
  name: string;

  /**
   * User's email address
   * - Required
   * - Must be valid email format (RFC 5322)
   * - Max length: 255
   */
  email: string;

  /**
   * User's age
   * - Optional (omit if unknown)
   * - Min: 0, Max: 150
   */
  age?: number;

  /**
   * User's roles
   * - Required (can be empty array for no roles)
   * - Each role must be one of: 'admin', 'user', 'guest'
   * - Max items: 10
   */
  roles: Array<'admin' | 'user' | 'guest'>;
}

// Runtime validation
function validateCreateUserRequest(data: unknown): CreateUserRequest {
  const schema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email().max(255),
    age: z.number().int().min(0).max(150).optional(),
    roles: z.array(z.enum(['admin', 'user', 'guest'])).max(10)
  });

  return schema.parse(data);  // Throws if invalid
}
```

### 4.3 Error Model
- [ ] Consistent error format across endpoints?
- [ ] Machine-readable error codes?
- [ ] Human-readable error messages?
- [ ] Retryability hints (is_retryable, retry_after)?
- [ ] Safe error details (no sensitive info in production)?
- [ ] Validation errors include field-level details?
- [ ] 4xx vs 5xx usage correct?

**Error response consistency:**
```typescript
// ❌ BAD: Inconsistent error responses
// Endpoint 1:
{ error: "User not found" }

// Endpoint 2:
{ message: "Invalid email", code: 400 }

// Endpoint 3:
{ errors: [{ field: "name", message: "Required" }] }

// ✅ GOOD: Consistent error format
interface ErrorResponse {
  /**
   * Machine-readable error code
   * - VALIDATION_ERROR: Client sent invalid data
   * - RESOURCE_NOT_FOUND: Requested resource doesn't exist
   * - AUTHENTICATION_REQUIRED: Missing or invalid auth
   * - AUTHORIZATION_FAILED: User lacks permission
   * - RATE_LIMIT_EXCEEDED: Too many requests
   * - INTERNAL_ERROR: Server error (retry)
   */
  code: string;

  /**
   * Human-readable error message
   * - Safe for display to end users
   * - No sensitive details (stack traces, SQL, etc.)
   */
  message: string;

  /**
   * Additional error details (optional)
   */
  details?: {
    /**
     * Field-level validation errors
     */
    validation_errors?: Array<{
      field: string;
      message: string;
      code: string;
    }>;

    /**
     * Retryability hint
     */
    is_retryable?: boolean;

    /**
     * Retry after (seconds)
     */
    retry_after?: number;
  };

  /**
   * Unique request ID for debugging
   */
  request_id: string;
}

// Example responses:
// 400 Bad Request (validation error)
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request data",
  "details": {
    "validation_errors": [
      { "field": "email", "message": "Invalid email format", "code": "INVALID_FORMAT" },
      { "field": "age", "message": "Must be between 0 and 150", "code": "OUT_OF_RANGE" }
    ],
    "is_retryable": false
  },
  "request_id": "req_abc123"
}

// 404 Not Found
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "User not found",
  "details": {
    "is_retryable": false
  },
  "request_id": "req_def456"
}

// 429 Too Many Requests
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please try again later.",
  "details": {
    "is_retryable": true,
    "retry_after": 60
  },
  "request_id": "req_ghi789"
}

// 500 Internal Server Error
{
  "code": "INTERNAL_ERROR",
  "message": "An unexpected error occurred. Please try again.",
  "details": {
    "is_retryable": true
  },
  "request_id": "req_jkl012"
}
```

### 4.4 Pagination & Limits
- [ ] Pagination required for list endpoints?
- [ ] Stable ordering (consistent sort order)?
- [ ] Cursor-based vs offset-based pagination?
- [ ] Max page size enforced?
- [ ] Pagination metadata included (total, has_more, next_cursor)?
- [ ] Default page size reasonable?

**Red flags:**
- List endpoint without pagination (returns all items)
- Unstable ordering (results change between requests)
- No max page size (client can request millions)
- Missing pagination metadata

**Pagination patterns:**
```typescript
// ❌ BAD: No pagination (unbounded)
GET /api/users
Response: { users: [...] }  // ❌ All users (could be millions)

// ✅ GOOD: Cursor-based pagination (recommended)
GET /api/users?limit=50&cursor=eyJpZCI6MTIzfQ

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    /**
     * Number of items in this page
     */
    count: number;

    /**
     * Cursor for next page (null if no more pages)
     */
    next_cursor: string | null;

    /**
     * Whether there are more pages
     */
    has_more: boolean;

    /**
     * Maximum items per page (server enforced)
     */
    limit: number;
  };
}

// Example:
{
  "data": [
    { "id": "123", "name": "Alice" },
    { "id": "124", "name": "Bob" },
    // ... 48 more items
  ],
  "pagination": {
    "count": 50,
    "next_cursor": "eyJpZCI6MTc0fQ",
    "has_more": true,
    "limit": 50
  }
}

// Alternative: Offset-based pagination (simpler, less efficient)
GET /api/users?limit=50&offset=100

interface OffsetPaginatedResponse<T> {
  data: T[];
  pagination: {
    /**
     * Current offset
     */
    offset: number;

    /**
     * Items per page
     */
    limit: number;

    /**
     * Total items (optional, expensive to compute)
     */
    total?: number;

    /**
     * Whether there are more pages
     */
    has_more: boolean;
  };
}

// Pagination best practices:
// 1. Enforce max page size (e.g., 100)
const MAX_PAGE_SIZE = 100;
const limit = Math.min(req.query.limit || 50, MAX_PAGE_SIZE);

// 2. Stable ordering (always sort by same field)
const users = await db.query(
  'SELECT * FROM users ORDER BY id ASC LIMIT ?',  // ✅ Stable order
  [limit]
);

// ❌ Don't:
const users = await db.query('SELECT * FROM users LIMIT ?', [limit]);
// Unstable order (database may return different order each time)

// 3. Include metadata
return {
  data: users,
  pagination: {
    count: users.length,
    next_cursor: users.length > 0 ? encode(users[users.length - 1].id) : null,
    has_more: users.length === limit,
    limit
  }
};
```

### 4.5 Idempotency
- [ ] Write operations (POST, PUT, PATCH, DELETE) support idempotency?
- [ ] Idempotency key handling (header, query param, body field)?
- [ ] Duplicate request detection (cache results for 24 hours)?
- [ ] Safe retries for failed requests?
- [ ] Status code 409 Conflict for idempotency key reuse with different params?

**Red flags:**
- POST endpoint without idempotency support
- Payment/order creation without idempotency key
- No duplicate detection (double charge risk)

**Idempotency patterns:**
```typescript
// ❌ BAD: No idempotency (unsafe retries)
POST /api/orders
{ "user_id": "123", "items": [...] }

// If network fails, client retries → creates duplicate order

// ✅ GOOD: Idempotency key support
POST /api/orders
Idempotency-Key: order_abc123xyz
{ "user_id": "123", "items": [...] }

// Server implementation:
async function createOrder(req: Request, res: Response) {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return res.status(400).json({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required for POST requests'
    });
  }

  // Check if request with this key already processed
  const cached = await redis.get(`idempotency:${idempotencyKey}`);

  if (cached) {
    const { status, body } = JSON.parse(cached);

    // Return same response (idempotent)
    return res.status(status).json(body);
  }

  // Process request
  const order = await orderService.createOrder(req.body);

  // Cache result (24 hour TTL)
  await redis.setex(
    `idempotency:${idempotencyKey}`,
    86400,
    JSON.stringify({
      status: 201,
      body: order
    })
  );

  res.status(201).json(order);
}

// Idempotency key conflict (same key, different params)
// Client sends:
// Request 1: Idempotency-Key: abc, body: { amount: 100 }
// Request 2: Idempotency-Key: abc, body: { amount: 200 }  // ❌ Different params

// Server responds with 409 Conflict:
{
  "code": "IDEMPOTENCY_KEY_CONFLICT",
  "message": "Idempotency key already used with different parameters",
  "request_id": "req_123"
}

// Idempotency for different HTTP methods:
// POST: Create (needs idempotency key)
// PUT: Replace (inherently idempotent - same PUT repeated = same result)
// PATCH: Update (should be idempotent - same PATCH repeated = same result)
// DELETE: Remove (inherently idempotent - delete twice = same result)
// GET: Read (inherently idempotent - safe)
```

### 4.6 Authentication & Authorization
- [ ] Authentication required where appropriate?
- [ ] Authorization checks at object level (not just endpoint)?
- [ ] Least privilege principle (users only access their own data)?
- [ ] Multi-tenant isolation (tenant_id filtering)?
- [ ] Consistent auth error responses (401 vs 403)?
- [ ] Rate limiting per user/tenant?

**Red flags:**
- No authentication on sensitive endpoints
- Missing authorization checks (any user can access any data)
- Privilege escalation risks
- No multi-tenant filtering

**Auth patterns:**
```typescript
// ❌ BAD: No authorization check
GET /api/users/:userId

async function getUser(req: Request, res: Response) {
  const userId = req.params.userId;

  // ❌ No check if current user can access this user
  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);

  res.json(user);
}

// Any authenticated user can access any user's data!

// ✅ GOOD: Object-level authorization
GET /api/users/:userId

async function getUser(req: Request, res: Response) {
  const userId = req.params.userId;
  const currentUserId = req.user.id;  // From auth token

  // ✅ Check if current user can access this user
  if (userId !== currentUserId && !req.user.isAdmin) {
    return res.status(403).json({
      code: 'AUTHORIZATION_FAILED',
      message: 'You do not have permission to access this user'
    });
  }

  const user = await db.query('SELECT * FROM users WHERE id = ?', [userId]);

  res.json(user);
}

// Multi-tenant authorization:
GET /api/tenants/:tenantId/orders

async function getOrders(req: Request, res: Response) {
  const tenantId = req.params.tenantId;
  const currentTenantId = req.user.tenantId;  // From auth token

  // ✅ Check tenant isolation
  if (tenantId !== currentTenantId) {
    return res.status(403).json({
      code: 'AUTHORIZATION_FAILED',
      message: 'You do not have permission to access this tenant'
    });
  }

  // ✅ Always filter by tenant_id (defense in depth)
  const orders = await db.query(
    'SELECT * FROM orders WHERE tenant_id = ?',
    [tenantId]
  );

  res.json(orders);
}

// 401 vs 403:
// 401 Unauthorized: Missing or invalid authentication (not logged in)
// 403 Forbidden: Valid auth, but lacks permission (logged in, but not allowed)

// ❌ Wrong:
if (!req.user) {
  return res.status(403).json({ error: 'Forbidden' });  // ❌ Should be 401
}

// ✅ Correct:
if (!req.user) {
  return res.status(401).json({
    code: 'AUTHENTICATION_REQUIRED',
    message: 'Authentication required. Please provide valid credentials.'
  });
}

if (!canAccessResource(req.user, resourceId)) {
  return res.status(403).json({
    code: 'AUTHORIZATION_FAILED',
    message: 'You do not have permission to access this resource.'
  });
}
```

### 4.7 API Consistency
- [ ] Naming conventions consistent (camelCase vs snake_case)?
- [ ] Resource modeling consistent (nouns, not verbs)?
- [ ] HTTP method usage correct (GET, POST, PUT, PATCH, DELETE)?
- [ ] Status codes used correctly?
- [ ] Date/time format consistent (ISO 8601)?
- [ ] ID format consistent (UUID, integer, etc.)?
- [ ] Pluralization consistent (users vs user, orders vs order)?

**Red flags:**
- Inconsistent casing (userId vs user_id)
- Verbs in resource paths (/createUser vs /users)
- Wrong HTTP methods (GET for mutations)
- Inconsistent date formats (ISO 8601 vs Unix timestamp)

**Consistency examples:**
```typescript
// ❌ BAD: Inconsistent naming
{
  "userId": "123",           // ❌ camelCase
  "user_name": "Alice",      // ❌ snake_case
  "UserEmail": "a@ex.com",   // ❌ PascalCase
  "created": 1640000000,     // ❌ Unix timestamp
  "updated_at": "2024-01-16" // ❌ ISO date
}

// ✅ GOOD: Consistent naming (pick one convention)
// Option 1: camelCase (JavaScript convention)
{
  "userId": "123",
  "userName": "Alice",
  "userEmail": "a@ex.com",
  "createdAt": "2024-01-16T10:30:00Z",  // ISO 8601
  "updatedAt": "2024-01-16T11:00:00Z"
}

// Option 2: snake_case (database/Python convention)
{
  "user_id": "123",
  "user_name": "Alice",
  "user_email": "a@ex.com",
  "created_at": "2024-01-16T10:30:00Z",
  "updated_at": "2024-01-16T11:00:00Z"
}

// ❌ BAD: Verbs in paths, wrong methods
GET /api/createUser
POST /api/getUser
PUT /api/deleteUser

// ✅ GOOD: RESTful resource paths, correct methods
POST   /api/users          # Create user
GET    /api/users          # List users
GET    /api/users/:id      # Get user
PUT    /api/users/:id      # Replace user
PATCH  /api/users/:id      # Update user
DELETE /api/users/:id      # Delete user

// Status code consistency:
// 2xx: Success
200 OK                     # GET, PATCH, DELETE success
201 Created                # POST success (resource created)
202 Accepted               # Async operation started
204 No Content             # DELETE success (no response body)

// 4xx: Client errors
400 Bad Request            # Invalid input
401 Unauthorized           # Missing/invalid auth
403 Forbidden              # Lacks permission
404 Not Found              # Resource doesn't exist
409 Conflict               # Resource conflict (duplicate, version mismatch)
422 Unprocessable Entity   # Validation error
429 Too Many Requests      # Rate limit exceeded

// 5xx: Server errors
500 Internal Server Error  # Unexpected error
502 Bad Gateway            # Upstream service error
503 Service Unavailable    # Temporarily down
504 Gateway Timeout        # Upstream timeout
```

### 4.8 Deprecation Strategy
- [ ] Deprecation warnings included in response headers?
- [ ] Deprecation timeline communicated?
- [ ] Migration guide provided?
- [ ] Sunset date specified?
- [ ] Deprecated endpoints still functional during deprecation period?

**Red flags:**
- Sudden removal of endpoints (no deprecation period)
- No migration path for consumers
- Undocumented deprecation

**Deprecation patterns:**
```typescript
// ✅ GOOD: Deprecation workflow
// Phase 1: Announce deprecation (6 months before removal)
GET /api/v1/users
Response:
{
  "users": [...],
  // Headers:
  "Deprecation": "true",
  "Sunset": "2024-07-16T00:00:00Z",
  "Link": "<https://api.example.com/docs/migration/users-v2>; rel=\"deprecation\""
}

// Body warning (optional):
{
  "users": [...],
  "_meta": {
    "deprecated": true,
    "deprecation_message": "This endpoint is deprecated and will be removed on 2024-07-16. Please migrate to /api/v2/users.",
    "migration_guide": "https://api.example.com/docs/migration/users-v2"
  }
}

// Phase 2: Monitor usage (log warnings for clients still using)
// Server logs:
// WARN: Client app_abc123 using deprecated endpoint /api/v1/users

// Phase 3: Final warning (1 month before removal)
GET /api/v1/users
Response:
{
  "users": [...],
  // Headers:
  "Deprecation": "true",
  "Sunset": "2024-07-16T00:00:00Z",
  "Warning": "299 - \"This endpoint will be removed in 30 days. Please migrate immediately.\""
}

// Phase 4: Removal (after sunset date)
GET /api/v1/users
Response: 410 Gone
{
  "code": "ENDPOINT_REMOVED",
  "message": "This endpoint has been removed. Please use /api/v2/users instead.",
  "details": {
    "removed_at": "2024-07-16T00:00:00Z",
    "replacement": "/api/v2/users",
    "migration_guide": "https://api.example.com/docs/migration/users-v2"
  }
}

// Versioning strategies:
// 1. URL versioning (recommended for public APIs)
GET /api/v1/users
GET /api/v2/users

// 2. Header versioning
GET /api/users
Accept: application/vnd.myapi.v1+json

// 3. Query parameter versioning
GET /api/users?version=1
GET /api/users?version=2

// Backward compatibility rules:
// v1.0.0 → v1.1.0 (minor): No breaking changes allowed
// - Can add optional fields
// - Can add new endpoints
// - Cannot remove fields
// - Cannot change field types

// v1.1.0 → v2.0.0 (major): Breaking changes allowed
// - Can remove fields
// - Can rename fields
// - Can change field types
// - Must provide migration guide
```

## Step 5: Generate Findings

For **each API contract issue** found, create a finding with:

### Finding Format

```markdown
### AC-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**API Contract Violation:**
- **Contract Element:** [Request schema | Response schema | Status code | Error format]
- **Impact on Consumers:** [How will existing clients be affected?]
- **Backward Compatible:** [Yes | No]
- **Mitigation:** [How can consumers work around this?]

**Consumer Impact Analysis:**
```
Existing client behavior:
1. Client sends: [request format]
2. Client expects: [response format]
3. After change: [what breaks]

Example breaking scenario:
[Concrete example of client code that breaks]
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (breaks consumers)
[current API contract]

// ✅ AFTER (backward compatible)
[fixed API contract]
```

**Why This Fix:**
[Explain how the fix maintains backward compatibility or provides migration path]

**Migration Guide (if breaking change unavoidable):**
```
[Step-by-step guide for consumers to migrate]
```
```

### Severity Guidelines

- **BLOCKER**: Breaking change in public API without major version bump
  - Example: Removed required field in response
  - Example: Changed field type (string → number)
  - Example: Changed status code semantics

- **HIGH**: Contract issue that causes client failures or data corruption
  - Example: No validation (allows invalid data)
  - Example: Missing idempotency (double charge risk)
  - Example: No authorization check (security issue)

- **MED**: Contract inconsistency or usability issue
  - Example: Inconsistent error format
  - Example: Missing pagination (performance issue)
  - Example: Unclear validation rules

- **LOW**: Minor contract improvement
  - Example: Could add more helpful error message
  - Example: Could include metadata field

- **NIT**: Stylistic or documentation improvement
  - Example: Could improve field naming
  - Example: Could add example in docs

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with API contract rules:

1. **Check API visibility**
   - Example: "Public API" → strict backward compatibility required

2. **Validate versioning policy**
   - Example: "Semantic versioning" → breaking changes require major version bump

3. **Verify backward compat requirements**
   - Example: "Strict backward compatibility" → no breaking changes in minor versions

## Step 7: API Contract Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** for public APIs:

1. **Breaking changes without major version bump** (removed/renamed fields, type changes)
2. **No idempotency for write operations** (POST, PUT, PATCH for critical resources)
3. **Missing authorization checks** (any user can access any data)
4. **Inconsistent error responses** (different formats across endpoints)
5. **No pagination for list endpoints** (unbounded responses)
6. **Sensitive data in error responses** (stack traces, SQL queries, secrets)

## Step 8: Compare API Versions (if applicable)

For versioned APIs, compare contracts:

1. **List all changes** between versions
2. **Classify changes**: Breaking vs non-breaking
3. **Check migration path**: Is there a clear upgrade path?
4. **Validate deprecation**: Are old versions properly deprecated?

**Tooling:**
```bash
# Generate OpenAPI diff
npx openapi-diff spec-v1.yaml spec-v2.yaml

# Check for breaking changes
npx openapi-diff --fail-on-breaking spec-v1.yaml spec-v2.yaml
```

## Step 9: Write API Contract Report

Create `.claude/<SESSION_SLUG>/reviews/api-contracts.md`:

```markdown
# API Contract Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## API Changes Summary

### New Endpoints
- [List new endpoints added]

### Modified Endpoints
- [List endpoints with contract changes]

### Removed Endpoints
- [List endpoints removed]

### Breaking Changes
- [List all breaking changes]

### Backward Compatible Changes
- [List non-breaking changes]

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## Breaking Changes Analysis

### Critical Breaking Changes (BLOCKER)
[List breaking changes that must be fixed or versioned]

### Acceptable Breaking Changes (with major version bump)
[List breaking changes OK if major version incremented]

---

## Migration Guide

[If breaking changes exist, provide migration guide for consumers]

### v1 → v2 Migration Steps
1. [Step 1: Update authentication]
2. [Step 2: Update request schemas]
3. [Step 3: Update response handling]
4. [Step 4: Test changes]

---

## Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - API contract violations]

### Short-term (HIGH)
[Actions for HIGH items - security/correctness issues]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - consistency improvements]

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide API contract context I may have missed
```

## Step 10: Output Summary

Print to console:

```
🔍 API Contract Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

🚨 Breaking changes: X

📝 Full report: .claude/<SESSION_SLUG>/reviews/api-contracts.md

⚠️  BLOCKER items: [list titles]
```

---

## Example Findings

[The file will continue with 5-7 detailed example findings similar to the previous review commands, covering:
1. Breaking change - removed field
2. Missing idempotency for payment endpoint
3. Inconsistent error response format
4. Missing authorization check
5. No pagination on list endpoint
6. Type change breaking backward compatibility
7. Missing validation on user input]

Each example will follow the same detailed pattern as previous review commands with:
- Complete code examples
- Consumer impact analysis
- Before/after remediation
- Migration guides where applicable
```

---

## Notes

- **Read full API definitions**: Always read complete endpoint definitions and related schemas
- **Check backward compatibility**: Compare with previous version to identify breaking changes
- **Consumer perspective**: Think from API consumer's viewpoint (will their code break?)
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after code with migration path
- **Cross-reference CONTEXT**: Check against versioning policy and compat requirements
- **False positives welcome**: Encourage users to challenge API contract interpretations
