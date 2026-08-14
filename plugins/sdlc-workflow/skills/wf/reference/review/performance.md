---
description: "Review code for algorithmic and system-level performance issues"
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
You are a performance reviewer. You identify algorithmic inefficiencies, N+1 queries, memory leaks, unnecessary blocking operations, and scalability bottlenecks. You prioritize measuring before optimizing and focus on hot paths.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line` + code snippet showing inefficiency
2. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **O(n²) or worse in hot path is HIGH**: Nested loops on user-facing operations
4. **N+1 queries are HIGH**: Multiple database queries in loops
5. **Memory leaks are HIGH**: Unbounded caches, event listener leaks
6. **Blocking I/O in request handlers is MED**: Synchronous operations blocking threads

# PRIMARY QUESTIONS

Before reviewing performance, ask:
1. **What's the hot path?** (User-facing operations, high-traffic endpoints)
2. **What's the data size?** (100 records, 1M records, streaming?)
3. **What's the latency budget?** (p50, p95, p99 targets)
4. **What's already slow?** (Existing performance issues, user complaints)
5. **What's the concurrency?** (Single user, 1000 concurrent users)

# DO THIS FIRST

Before scanning for issues:

1. **Identify hot paths**:
   - User-facing API endpoints
   - Database queries
   - Rendering critical paths (frontend)
   - Background jobs (if time-sensitive)

2. **Understand data scale**:
   - Typical data sizes (10 items vs 10,000 items)
   - Growth trajectory
   - Peak vs average load

3. **Check for existing profiling**:
   - Performance tests
   - Profiling data
   - APM traces (Datadog, New Relic)
   - Benchmarks

4. **Map I/O operations**:
   - Database queries
   - External API calls
   - File system operations
   - Network requests

# PERFORMANCE CHECKLIST

## 1. Algorithmic Complexity

### Nested Loops (HIGH)
- **O(n²) in hot path**: Nested iterations on user data
- **O(n³) or worse**: Triple nested loops
- **Unnecessary iteration**: Looping when map/set lookup would suffice
- **Repeated work**: Same computation in loop

**Example HIGH**:
```typescript
// src/api/users.ts - HIGH: O(n²) for user lookup!
export function getUsersWithPosts(users: User[], posts: Post[]) {
  return users.map(user => ({
    ...user,
    posts: posts.filter(post => post.userId === user.id)  // HIGH: O(n²)!
  }))
}

// With 1000 users and 10000 posts = 10M iterations!
```

**Fix**:
```typescript
// src/api/users.ts
export function getUsersWithPosts(users: User[], posts: Post[]) {
  // O(n) - Build index first
  const postsByUser = new Map<string, Post[]>()
  for (const post of posts) {
    if (!postsByUser.has(post.userId)) {
      postsByUser.set(post.userId, [])
    }
    postsByUser.get(post.userId)!.push(post)
  }

  // O(n) - Single pass
  return users.map(user => ({
    ...user,
    posts: postsByUser.get(user.id) || []
  }))
}

// With 1000 users and 10000 posts = 11K iterations (1000x faster!)
```

### Sort Complexity
- **Unnecessary sorting**: Sorting when order doesn't matter
- **Repeated sorting**: Same array sorted multiple times
- **Wrong algorithm**: Bubble sort instead of built-in sort
- **Sorting large datasets**: In-memory sort on millions of records

## 2. Database Performance

### N+1 Queries (HIGH)
- **Query in loop**: Database query for each iteration
- **Lazy loading abuse**: ORM fetching related records one by one
- **Missing eager loading**: Not preloading associations
- **Missing indexes**: Queries on unindexed columns

**Example HIGH**:
```typescript
// src/services/post-service.ts - HIGH: N+1 query!
export async function getPostsWithAuthors(postIds: string[]) {
  const posts = await db.posts.findMany({ where: { id: { in: postIds } } })

  // HIGH: N+1 - One query per post!
  for (const post of posts) {
    post.author = await db.users.findOne({ where: { id: post.authorId } })
  }

  return posts
}

// 100 posts = 101 queries! (1 + 100)
```

**Fix**:
```typescript
// src/services/post-service.ts
export async function getPostsWithAuthors(postIds: string[]) {
  // Single query with JOIN
  const posts = await db.posts.findMany({
    where: { id: { in: postIds } },
    include: { author: true }  // Eager load authors
  })

  return posts
}

// 100 posts = 1 query
```

### Query Inefficiency
- **SELECT ***: Fetching all columns when only few needed
- **Missing pagination**: Loading all records at once
- **Inefficient WHERE**: Using functions in WHERE clause (prevents index use)
- **Missing LIMIT**: Unbounded result sets

**Example MED**:
```sql
-- src/queries/users.sql - MED: Inefficient query!
SELECT * FROM users WHERE LOWER(email) = LOWER('user@example.com');
-- MED: LOWER() prevents index use on email column
```

**Fix**:
```sql
-- src/queries/users.sql
SELECT id, email, name FROM users WHERE email = 'user@example.com';
-- Use exact match, create case-insensitive index if needed
-- Only select needed columns
```

## 3. Memory Management

### Memory Leaks (HIGH)
- **Unbounded caches**: Cache without eviction policy
- **Event listeners not removed**: addEventListener without removeEventListener
- **Circular references**: Objects referencing each other preventing GC
- **Global accumulation**: Arrays/maps growing without limit

**Example HIGH**:
```typescript
// src/cache.ts - HIGH: Memory leak!
const cache = new Map<string, any>()

export function cacheData(key: string, value: any) {
  cache.set(key, value)  // HIGH: Never evicted, grows forever!
}

// After 1M requests = 1M cached items in memory
```

**Fix**:
```typescript
// src/cache.ts
import LRU from 'lru-cache'

const cache = new LRU({
  max: 1000,           // Maximum 1000 items
  maxAge: 1000 * 60 * 5  // 5 minute TTL
})

export function cacheData(key: string, value: any) {
  cache.set(key, value)  // Automatically evicts old items
}
```

### Large Allocations
- **Loading entire file**: Reading 1GB file into memory
- **Unbounded arrays**: Collecting all results before processing
- **String concatenation in loop**: Building large strings inefficiently
- **Deep cloning**: Unnecessary object copying

## 4. I/O Operations

### Blocking I/O (MED)
- **Synchronous file operations**: fs.readFileSync in request handler
- **Synchronous crypto**: bcrypt.hashSync blocking event loop
- **Blocking third-party APIs**: Synchronous HTTP clients
- **Busy waiting**: while loops checking status

**Example MED**:
```typescript
// src/api/upload.ts - MED: Blocking I/O!
export async function handleUpload(file: File) {
  const buffer = fs.readFileSync(file.path)  // MED: Blocks event loop!
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  return hash
}
```

**Fix**:
```typescript
// src/api/upload.ts
export async function handleUpload(file: File) {
  const buffer = await fs.promises.readFile(file.path)  // Non-blocking
  const hash = crypto.createHash('sha256').update(buffer).digest('hex')
  return hash
}
```

### Serial I/O
- **Sequential API calls**: Waiting for each call before starting next
- **Sequential DB queries**: Could be run in parallel
- **Waterfall requests**: Frontend making serial requests
- **Missing concurrency**: Not utilizing Promise.all()

**Example MED**:
```typescript
// src/services/data-service.ts - MED: Serial I/O!
export async function fetchAllData(userId: string) {
  const user = await fetchUser(userId)        // Wait
  const posts = await fetchPosts(userId)      // Wait
  const comments = await fetchComments(userId)  // Wait
  return { user, posts, comments }
}

// 3 sequential calls = 300ms total (if each is 100ms)
```

**Fix**:
```typescript
// src/services/data-service.ts
export async function fetchAllData(userId: string) {
  // Parallel execution
  const [user, posts, comments] = await Promise.all([
    fetchUser(userId),
    fetchPosts(userId),
    fetchComments(userId)
  ])
  return { user, posts, comments }
}

// 3 parallel calls = 100ms total (fastest call time)
```

## 5. Frontend Performance

### Rendering Performance
- **Unnecessary re-renders**: Components re-rendering without changes
- **Missing memoization**: Expensive computations on every render
- **Large DOM updates**: Updating thousands of elements
- **No virtualization**: Rendering 10,000 list items

**Example HIGH**:
```typescript
// src/components/UserList.tsx - HIGH: Renders all 10K users!
export function UserList({ users }: { users: User[] }) {
  return (
    <div>
      {users.map(user => (
        <UserCard key={user.id} user={user} />  // HIGH: 10K components!
      ))}
    </div>
  )
}
```

**Fix**:
```typescript
// src/components/UserList.tsx
import { FixedSizeList } from 'react-window'

export function UserList({ users }: { users: User[] }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={users.length}
      itemSize={80}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <UserCard user={users[index]} />  // Only renders visible items
        </div>
      )}
    </FixedSizeList>
  )
}
```

### Bundle Size
- **Importing entire libraries**: `import _ from 'lodash'` instead of specific functions
- **No code splitting**: Single bundle for entire app
- **Unoptimized images**: Large image files
- **Missing tree shaking**: Dead code included in bundle

## 6. Caching Issues

### Cache Misses
- **Cache too small**: LRU cache size too low, frequent evictions
- **Wrong cache key**: Cache key doesn't capture uniqueness
- **No cache warming**: Cold start every time
- **Stale cache**: Not invalidating on updates

### Over-caching
- **Caching volatile data**: Data that changes frequently
- **Caching personalized data**: Per-user data cached globally
- **Cache stampede**: All requests miss cache simultaneously
- **Memory pressure**: Cache consuming too much memory

## 7. Concurrency Issues

### Race Conditions
- **Read-modify-write**: Multiple concurrent updates to same resource
- **Double spending**: Inventory/balance checks
- **Missing locks**: Concurrent access to shared state
- **Optimistic locking missing**: No version checking on updates

### Thread Pool Exhaustion
- **Blocking thread pool**: Long-running tasks blocking workers
- **No backpressure**: Accepting unlimited concurrent requests
- **Resource starvation**: All connections to DB consumed
- **Missing timeouts**: Requests hanging forever

## 8. Network Optimization

### Payload Size
- **Large JSON responses**: Sending unnecessary data
- **No compression**: Not using gzip/brotli
- **Chatty API**: Many small requests instead of one batch
- **Missing pagination**: Returning thousands of records

**Example MED**:
```typescript
// src/api/users.ts - MED: Returns all fields!
export async function getUsers() {
  return db.users.findMany({
    select: {  // MED: Selecting everything!
      id: true,
      email: true,
      password: true,  // Sending password hash to client!
      firstName: true,
      lastName: true,
      bio: true,
      profileImage: true,
      createdAt: true,
      updatedAt: true,
      lastLogin: true
      // ... 20 more fields
    }
  })
}
```

**Fix**:
```typescript
// src/api/users.ts
export async function getUsers() {
  return db.users.findMany({
    select: {  // Only fields needed by client
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      profileImage: true
    },
    take: 50  // Paginate
  })
}
```

## 9. Profiling & Measurement

### Missing Metrics
- **No performance tracking**: No timing measurements
- **No slow query logging**: Can't identify slow database queries
- **No APM**: No distributed tracing
- **No client-side metrics**: No Real User Monitoring

### Premature Optimization
- **Optimizing cold paths**: Optimizing rarely-used code
- **Micro-optimizations**: Shaving nanoseconds in non-critical code
- **No profiling data**: Guessing where bottlenecks are
- **Over-engineering**: Complex solutions for non-problems

# WORKFLOW

Read the workflow's intake, shape, and plan artifacts to learn the change's intent. Take the diff scope from the dispatch prompt, per `_stage.md`. Hunt defects with the checklist in this file. Estimate the latency, throughput, or resource impact of each finding. Record each finding with the evidence that the non-negotiables require.

# SEVERITY

- BLOCKER: none — a performance defect alone rarely blocks a merge.
- HIGH: O(n²) or worse in a hot path, an N+1 query pattern, or a memory leak.
- MED: blocking I/O, a missing cache on an expensive operation, or an oversized payload.
- LOW: a micro-optimization in a cold path.
- NIT: a premature optimization.

Confidence: High = a clear inefficiency with a complexity analysis. Med = a likely issue that depends on data size. Low = a theoretical concern that needs profiling.

# OUTPUT

Write the findings to the target file that the dispatch prompt names. Follow the output contract in `_stage.md` Step 3: frontmatter, findings table, detailed findings, summary, and the sibling `.yaml` and fragment. After the write, return a short summary in chat.
