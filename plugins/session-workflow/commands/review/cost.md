---
name: review:cost
description: Review code for changes that increase cloud infrastructure costs
usage: /review:cost [SCOPE] [TARGET] [PATHS] [CONTEXT]
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
    description: 'Additional context: cloud provider (AWS/GCP/Azure), major cost centers, expected traffic'
    required: false
examples:
  - command: /review:cost pr 123
    description: Review PR #123 for cost implications
  - command: /review:cost worktree "src/api/**"
    description: Review API layer for cost increases
  - command: /review:cost diff main..feature "CONTEXT: AWS, 10M requests/day, main costs are DynamoDB + Lambda + CloudWatch"
    description: Review branch diff with cost context
---

# Cost Review

You are a cost reviewer identifying changes that increase cloud spend: database load, compute, storage, logs, metrics cardinality, and network egress.

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
| add-metrics  | 2024-01-16 | 🔄 |  ← Use this
```
→ `SESSION_SLUG=add-metrics`

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
  - Review all cost-sensitive areas: hot paths, cron jobs, logging, metrics

If `PATHS` is provided, filter results to matching globs.

## Step 2: Extract Changed Code

For each file in scope:
1. **Identify changed functions/classes** (for pr/worktree/diff scopes)
2. **Read full context** (entire function/class, not just diff lines)
3. **Identify cost-sensitive areas**:
   - Request handlers (multiplied by traffic)
   - Cron jobs (frequency × resource usage)
   - Database queries (read/write units, storage)
   - Logging statements (volume × retention)
   - Metrics (cardinality × retention)
   - External API calls (third-party costs)

**Critical**: Always read the **complete function/method body** to understand full context, not just the diff hunks.

## Step 3: Parse CONTEXT (if provided)

Extract cost expectations from `CONTEXT` parameter:

- **Cloud provider**: AWS, GCP, Azure (different cost models)
- **Traffic volume**: Requests/day, events/day (multiplier for per-request costs)
- **Major cost centers**: Which services drive most spend (prioritize these)
- **Cost constraints**: Budget limits, cost targets

Example:
```
CONTEXT: AWS, 10M requests/day, main costs are DynamoDB (60%), Lambda (25%), CloudWatch (15%)
```

## Step 4: Cost Checklist Review

For each changed function/class, systematically check:

### 4.1 Database Cost
- [ ] More queries per request (chatty patterns)?
- [ ] Bigger scans or joins (more RCUs/WCUs)?
- [ ] Missing pagination causing large reads?
- [ ] Missing filters (reading more data than needed)?
- [ ] New indexes (storage + write amplification)?
- [ ] Hot partitions (throttling → retries → more cost)?

**Pricing models:**
- **DynamoDB**: $0.25/GB storage, $0.25 per million WCUs, $0.25 per million RCUs
- **RDS/Aurora**: Instance hours + storage ($0.10-0.20/GB) + I/O ($0.20 per million)
- **MongoDB Atlas**: Instance size (M10 = $0.08/hr, M30 = $0.54/hr)

**Red flags:**
- N+1 queries → 100x more read cost
- Scan entire table → expensive with large tables
- Missing GSI/index → slow queries, more RCUs
- Writing to multiple indexes → write amplification

### 4.2 Compute Cost
- [ ] Heavier per-request CPU (more instance hours)?
- [ ] Expensive serialization/parsing in hot path?
- [ ] Cron jobs that scale with data size unnecessarily?
- [ ] Lambda memory/timeout increased?
- [ ] Cold starts increased (more function instances)?
- [ ] Synchronous processing that could be async/batched?

**Pricing models:**
- **Lambda**: $0.20 per 1M requests + $0.0000166667 per GB-second
- **ECS/Fargate**: $0.04048 per vCPU-hour + $0.004445 per GB-hour
- **EC2**: $0.0116/hr (t3.micro) to $3.06/hr (c5.4xlarge)

**Red flags:**
- O(n²) algorithm in request handler → 100x more CPU
- Processing all records in cron job (should paginate)
- Increased Lambda timeout (pay for idle time)
- Increased Lambda memory (linear cost)

### 4.3 Storage Cost
- [ ] New tables/indexes with heavy write amplification?
- [ ] Storing large blobs uncompressed?
- [ ] Retention policy not defined (grows forever)?
- [ ] Duplicate data (denormalization without cleanup)?
- [ ] Hot data not tiered to cold storage?

**Pricing models:**
- **S3**: $0.023/GB (standard), $0.0125/GB (IA), $0.004/GB (Glacier)
- **EBS**: $0.10/GB (gp3), $0.125/GB (io2)
- **DynamoDB**: $0.25/GB

**Red flags:**
- Storing uncompressed images (10x cost vs compressed)
- No TTL/expiration (unbounded growth)
- Logs stored in primary DB (should use S3/CloudWatch)
- Multiple indexes on high-write table (write amplification)

### 4.4 Logging Cost
- [ ] Verbose logs in hot paths?
- [ ] Logging large objects (full request/response bodies)?
- [ ] Log level too low (DEBUG in production)?
- [ ] No sampling for high-volume logs?
- [ ] Long retention period for all logs?

**Pricing models:**
- **CloudWatch Logs**: $0.50/GB ingestion + $0.03/GB storage
- **Datadog**: $0.10/GB ingestion (with indexing)
- **Splunk**: $150-200 per GB/day

**Cost multipliers:**
```
10M requests/day × 1KB log/request = 10GB/day
- Ingestion: 10 GB/day × $0.50 = $5/day = $150/month
- Storage: 10 GB/day × 30 days × $0.03 = $9/month
- Total: $159/month for one log statement

If increase log size to 10KB:
- Total: $1,590/month (10x increase)
```

**Red flags:**
- `console.log(JSON.stringify(hugeObject))` in request handler
- DEBUG level in production (10x more logs)
- Logging full request bodies (PII + cost)
- No sampling (log every event vs 1%)

### 4.5 Metrics Cost
- [ ] High-cardinality labels/tags in metrics?
- [ ] Too many unique time series created?
- [ ] Per-user or per-request metrics (unbounded cardinality)?
- [ ] Recording metrics for every event (should sample)?
- [ ] Long retention for high-resolution metrics?

**Pricing models:**
- **CloudWatch Metrics**: $0.30 per custom metric/month (first 10k), $0.10 after
- **Datadog**: $0.05 per custom metric/month
- **Prometheus**: Storage cost (usually negligible, but cardinality kills performance)

**Cardinality explosion:**
```
Example: metrics.increment('api.request', { user_id: userId, endpoint: endpoint })

- 1M users × 50 endpoints = 50M unique time series
- CloudWatch: 50M metrics × $0.10 = $5,000,000/month
- Datadog: 50M metrics × $0.05 = $2,500,000/month

Better: metrics.increment('api.request', { endpoint: endpoint })
- 50 endpoints = 50 unique time series
- CloudWatch: 50 metrics × $0.30 = $15/month
```

**Red flags:**
- User ID, request ID, or other unbounded values as labels
- Recording every event (should aggregate)
- High-resolution metrics (1s) for everything (use 1m for most)

### 4.6 Network Egress Cost
- [ ] Sending large payloads to clients (data transfer out)?
- [ ] Cross-region traffic patterns introduced?
- [ ] Serving media from expensive storage (should use CDN)?
- [ ] API returning full objects (should return IDs)?
- [ ] No compression for large responses?

**Pricing models:**
- **AWS Data Transfer Out**: $0.09/GB (first 10TB), $0.085/GB (next 40TB)
- **CloudFront (CDN)**: $0.085/GB (cheaper than direct EC2/S3 egress)
- **Cross-region**: $0.01-0.02/GB (within AWS regions)

**Cost multipliers:**
```
10M requests/day × 100KB response = 1TB/day egress
- AWS egress: 30 TB/month × $0.09 = $2,700/month
- With compression (10x): 3 TB/month × $0.09 = $270/month
- With CDN: 30 TB/month × $0.085 + cache hits = ~$500/month
```

**Red flags:**
- Returning 10MB responses (should paginate)
- Serving videos directly from S3 (should use CloudFront)
- Cross-region database queries (should replicate)
- No gzip/brotli compression

### 4.7 Third-Party API Costs
- [ ] More API calls per request?
- [ ] Expensive API endpoints called (AI, maps, payments)?
- [ ] No caching of API responses?
- [ ] No rate limiting (unbounded spend)?
- [ ] Synchronous calls (could batch)?

**Pricing examples:**
- **OpenAI GPT-4**: $0.03 per 1k input tokens, $0.06 per 1k output tokens
- **Google Maps Geocoding**: $5 per 1k requests
- **Stripe**: 2.9% + $0.30 per transaction
- **Twilio SMS**: $0.0079 per message

**Cost multipliers:**
```
Example: Add GPT-4 call to every user message
- 1M messages/day × $0.10/call = $100k/day = $3M/month

Better: Cache responses, use cheaper model for simple cases
- 1M messages/day × 10% cache hit = 900k calls
- 900k × 80% GPT-3.5 ($0.002) + 20% GPT-4 ($0.10) = $1.8k + $18k = $19.8k/month
```

**Red flags:**
- AI calls in hot path without caching
- No fallback to cheaper alternatives
- Per-user API calls (N+1 pattern)

### 4.8 Hidden Multipliers
- [ ] Loop over large collections with expensive operations?
- [ ] Per-item API calls (should batch)?
- [ ] Cron job frequency increased?
- [ ] Auto-scaling thresholds lowered (more instances)?
- [ ] New background job processing all records?

**Cost multipliers:**
```
Example: Cron job processing all users
- 1M users × 5 DB queries/user × $0.25 per 1M RCUs = $1.25 per run
- Run every 5 minutes: 288 runs/day × $1.25 = $360/day = $10,800/month

Better: Process incrementally, only changed users
- 10k changed users/day × 5 queries × $0.25 per 1M = $0.125/day = $3.75/month
```

**Red flags:**
- Cron job iterating all records (should be incremental)
- Per-item API/DB calls in loop (should batch)
- Increased job frequency (every minute vs every hour)

## Step 5: Generate Findings

For **each cost issue** found, create a finding with:

### Finding Format

```markdown
### CO-N: [Issue Title] [SEVERITY]

**Evidence:**
**File:** `path/to/file.ts:123`
```language
[exact code snippet showing the issue]
```

**Cost Impact:**
- **Current Traffic:** [From CONTEXT or estimate]
- **Cost Increase:** [Estimated monthly cost increase]
- **Cost Driver:** [What resource causes the cost]
- **Scaling:** [How cost grows with traffic]

**Cost Calculation:**
```
Traffic: [X requests/day or events/day]
Resource usage: [Y per request]
Unit cost: [$ per unit]

Monthly cost = [calculation]

Example:
- Current: [existing cost]
- After change: [new cost]
- Increase: [delta]
```

**Severity:** [BLOCKER | HIGH | MED | LOW | NIT]
**Confidence:** [High | Med | Low]

**Remediation:**
```language
// ❌ BEFORE (expensive)
[current code]

// ✅ AFTER (cost-optimized)
[optimized code]
```

**Why This Fix:**
[Explain cost reduction strategy]

**Cost Savings:**
```
Before: $X/month
After: $Y/month
Savings: $Z/month (N% reduction)
```
```

### Severity Guidelines

- **BLOCKER**: Cost increase >$10k/month or >100% current spend
  - Example: Unbounded cardinality explosion → $1M/month metrics cost
  - Example: N+1 API calls to expensive service → $50k/month

- **HIGH**: Cost increase $1k-10k/month or 20-100% current spend
  - Example: Logging full request bodies → $5k/month CloudWatch
  - Example: Missing pagination → 10x database reads

- **MED**: Cost increase $100-1k/month or 5-20% current spend
  - Example: Verbose logging in hot path → $500/month
  - Example: No compression on responses → $300/month egress

- **LOW**: Cost increase $10-100/month or 1-5% current spend
  - Example: Slightly more database queries → $50/month
  - Example: Additional metric → $20/month

- **NIT**: Cost increase <$10/month
  - Example: Minor logging increase → $5/month

## Step 6: Cross-Reference with CONTEXT

If `CONTEXT` was provided with cost information:

1. **Identify major cost centers**
   - Example: "main costs are DynamoDB (60%)" → prioritize DB-related findings

2. **Calculate cost with traffic volume**
   - Example: "10M requests/day" → multiply per-request costs by 10M

3. **Cloud provider pricing**
   - AWS, GCP, Azure have different pricing models
   - Use correct pricing for calculations

## Step 7: Cost Non-Negotiables (Always BLOCKER)

These issues are **always BLOCKER** regardless of current cost:

1. **Unbounded cardinality** in metrics (user ID, request ID as labels)
2. **Third-party API calls in loop** without batching (e.g., N+1 OpenAI calls)
3. **Full table scans** in cron job processing all records
4. **No retention policy** on logs or data (unbounded growth)
5. **Logging large objects** (>10KB) in hot path (>1M requests/day)
6. **Cross-region traffic** for every request (should replicate)

## Step 8: Write Cost Report

Create `.claude/<SESSION_SLUG>/reviews/cost.md`:

```markdown
# Cost Review

**Session:** <SESSION_SLUG>
**Scope:** <SCOPE> <TARGET>
**Reviewed:** <timestamp>
**Context:** <CONTEXT if provided>

## Summary

- **Total Findings:** X
- **BLOCKER:** X | **HIGH:** X | **MED:** X | **LOW:** X | **NIT:** X
- **Confidence Distribution:** High: X | Med: X | Low: X

## Cost Impact Summary

### Estimated Cost Increases
- **Database:** +$X/month ([details])
- **Compute:** +$X/month ([details])
- **Storage:** +$X/month ([details])
- **Logging:** +$X/month ([details])
- **Metrics:** +$X/month ([details])
- **Network:** +$X/month ([details])
- **Third-party APIs:** +$X/month ([details])

**Total Estimated Increase:** +$X/month (Y% of current spend)

### Cost Drivers
1. [Primary cost driver - issue]
2. [Secondary cost driver - issue]
3. [Tertiary cost driver - issue]

---

## Findings

[Insert all findings here in order: BLOCKER → HIGH → MED → LOW → NIT]

---

## Recommendations

### Immediate (BLOCKER)
[Actions for BLOCKER items - must fix to avoid runaway costs]

### Short-term (HIGH)
[Actions for HIGH items - significant cost savings]

### Medium-term (MED/LOW)
[Actions for MED/LOW items - incremental optimizations]

### Cost Monitoring
[Recommend CloudWatch alarms, billing alerts, or cost anomaly detection]

---

## Cost Optimization Opportunities

[List additional optimizations not directly related to changes but discovered during review]

---

## False Positives & Disagreements Welcome

If any finding is not applicable or incorrect:
1. Document why in PR comments (helps improve this review)
2. Mark finding as `[FALSE POSITIVE]` with explanation
3. Provide traffic or cost context I may have missed
```

## Step 9: Output Summary

Print to console:

```
🔍 Cost Review Complete

📊 Findings: X total (BLOCKER: X, HIGH: X, MED: X, LOW: X, NIT: X)

💰 Estimated cost increase: +$X/month (Y% current spend)

📝 Full report: .claude/<SESSION_SLUG>/reviews/cost.md

⚠️  BLOCKER items: [list titles]
```

---

## Example Findings

### Example 1: High-Cardinality Metrics (Cardinality Explosion)

```markdown
### CO-1: User ID in Metric Labels → $2.5M/month Cost [BLOCKER]

**Evidence:**
**File:** `src/middleware/metrics.ts:23`
```typescript
app.use((req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // ❌ user_id is unbounded cardinality (1M+ unique users)
    metrics.histogram('http.request.duration', duration, {
      method: req.method,
      endpoint: req.path,
      status: res.statusCode,
      user_id: req.user?.id  // ❌ CARDINALITY EXPLOSION
    });
  });

  next();
});
```

**Cost Impact:**
- **Current Traffic:** 10M requests/day (from CONTEXT)
- **Cost Increase:** +$2,500,000/month
- **Cost Driver:** Datadog custom metrics (unbounded cardinality)
- **Scaling:** Linear with number of unique users

**Cost Calculation:**
```
Traffic: 10M requests/day
Unique users: 1M
Unique endpoints: 50
HTTP methods: 5 (GET, POST, PUT, DELETE, PATCH)
Status codes: 10 (200, 201, 400, 401, 403, 404, 500, etc.)

Time series = users × endpoints × methods × statuses
            = 1,000,000 × 50 × 5 × 10
            = 2,500,000,000 unique time series

Datadog pricing: $0.05 per custom metric/month (after 100 free)
Monthly cost = 2.5 billion metrics × $0.05 = $125,000,000/month

Wait, Datadog has limits. Actual: You'll hit cardinality limits and metrics will be dropped.

Realistic impact:
- Datadog bills for unique time series per metric name
- This creates 2.5B unique time series
- Datadog likely throttles at ~1M time series (plan limit)
- You'd need enterprise plan: ~$50,000/month base + overages

Better estimate: $2,500,000/month (enterprise plan + overages)

Without user_id:
Time series = endpoints × methods × statuses
            = 50 × 5 × 10
            = 2,500 unique time series
Monthly cost = 2,500 metrics × $0.05 = $125/month

Cost increase: +$2,499,875/month
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (unbounded cardinality)
metrics.histogram('http.request.duration', duration, {
  method: req.method,
  endpoint: req.path,
  status: res.statusCode,
  user_id: req.user?.id  // ❌ Unbounded cardinality
});

// ✅ AFTER (bounded cardinality)
metrics.histogram('http.request.duration', duration, {
  method: req.method,
  endpoint: req.path,  // Consider normalizing: /users/:id → /users/{id}
  status_class: Math.floor(res.statusCode / 100),  // 2xx, 4xx, 5xx (not exact code)
  // ❌ NO user_id, request_id, or other unbounded labels
});

// If you need per-user metrics, use separate system
// Log to analytics DB, not metrics system
if (req.user?.id) {
  await analyticsDB.insert({
    user_id: req.user.id,
    endpoint: req.path,
    duration,
    timestamp: Date.now()
  });
}

// Or sample: only record for 1% of requests
if (Math.random() < 0.01) {
  await analyticsDB.insert({ user_id: req.user.id, ... });
}
```

**Why This Fix:**
- **Remove unbounded labels**: Never use user ID, request ID, session ID as metric labels
- **Bounded cardinality**: Only use low-cardinality labels (endpoint, method, status class)
- **Normalize endpoints**: `/users/123` → `/users/{id}` (avoids explosion from IDs in paths)
- **Use analytics DB for per-user data**: Metrics are for aggregates, not per-entity tracking
- **Sample if needed**: Record 1% of events in detail, not 100%

**Cost Savings:**
```
Before: $2,500,000/month (cardinality explosion)
After: $125/month (2,500 time series)
Savings: $2,499,875/month (99.995% reduction)
```

**Cardinality Best Practices:**
```typescript
// ✅ GOOD: Bounded cardinality
metrics.increment('api.errors', {
  endpoint: '/api/users',
  error_type: 'validation_error',
  status: 400
});
// Cardinality: 50 endpoints × 10 error types × 10 statuses = 5,000

// ❌ BAD: Unbounded cardinality
metrics.increment('api.errors', {
  user_id: '12345',           // ❌ Unbounded
  request_id: 'abc-def-123',  // ❌ Unbounded
  error_message: 'Invalid email format'  // ❌ Unbounded (free-form text)
});
// Cardinality: 1M users × unlimited requests × unlimited messages = BILLIONS
```
```

### Example 2: Logging Full Request Bodies in Hot Path

```markdown
### CO-2: Logging Full Request Bodies → $5k/month CloudWatch Cost [HIGH]

**Evidence:**
**File:** `src/middleware/logging.ts:45`
```typescript
app.use((req, res, next) => {
  // ❌ Logs full request body (can be MBs) for every request
  console.log('Incoming request', {
    method: req.method,
    path: req.path,
    body: req.body,  // ❌ Full body (potentially huge)
    headers: req.headers,  // ❌ All headers (verbose)
    user: req.user  // ❌ Full user object
  });

  next();
});
```

**Cost Impact:**
- **Current Traffic:** 10M requests/day (from CONTEXT)
- **Cost Increase:** +$5,000/month
- **Cost Driver:** CloudWatch Logs ingestion + storage
- **Scaling:** Linear with request volume and log size

**Cost Calculation:**
```
Traffic: 10M requests/day = 300M requests/month
Average request body size: 5KB (JSON payloads)
Headers: 1KB
User object: 500 bytes

Log size per request = 5KB + 1KB + 0.5KB + overhead = ~7KB

Monthly log volume = 300M requests × 7KB = 2,100 GB/month = 2.1 TB/month

CloudWatch Logs pricing:
- Ingestion: 2,100 GB × $0.50/GB = $1,050/month
- Storage (30 day retention): 2,100 GB × $0.03/GB = $63/month
- Data transfer (queries): ~$100/month

Total: $1,213/month for this one log statement

If increase to 20KB average (larger payloads):
- 300M × 20KB = 6 TB/month
- Ingestion: 6,000 GB × $0.50 = $3,000/month
- Storage: 6,000 GB × $0.03 = $180/month
- Total: $3,180/month

Current baseline logging: ~$200/month
Cost increase: +$3,180 - $200 = +$2,980/month ≈ $3k/month

With 100M requests/day (10x growth):
- Cost: $30,000/month (scales linearly)
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (verbose, logs everything)
app.use((req, res, next) => {
  console.log('Incoming request', {
    method: req.method,
    path: req.path,
    body: req.body,          // ❌ Full body
    headers: req.headers,    // ❌ All headers
    user: req.user           // ❌ Full user object
  });

  next();
});

// ✅ AFTER (minimal logging, sample verbose logs)
app.use((req, res, next) => {
  // Basic logging for all requests (small)
  console.log('request', {
    method: req.method,
    path: req.path,
    user_id: req.user?.id,  // Just ID, not full object
    ip: req.ip
  });
  // ~200 bytes per request

  // Verbose logging only for sampled requests (1%)
  if (Math.random() < 0.01) {
    console.log('request_verbose', {
      method: req.method,
      path: req.path,
      body: req.body,
      headers: req.headers,
      user: req.user
    });
  }

  next();
});

// Better: Only log full body on errors
app.use((err, req, res, next) => {
  console.error('request_error', {
    method: req.method,
    path: req.path,
    body: req.body,  // ✅ OK to log on error (low volume)
    error: err.message,
    stack: err.stack
  });

  res.status(500).json({ error: 'Internal server error' });
});

// Best: Use structured logging with log levels
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',  // Production: 'info', Dev: 'debug'
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});

app.use((req, res, next) => {
  // INFO level: Always logged (minimal)
  logger.info('request', {
    method: req.method,
    path: req.path,
    user_id: req.user?.id
  });

  // DEBUG level: Only in development (verbose)
  logger.debug('request_verbose', {
    body: req.body,
    headers: req.headers,
    user: req.user
  });

  next();
});
```

**Why This Fix:**
- **Minimal logging**: Log only essential fields (method, path, user_id)
  - 200 bytes per request vs 7KB (35x reduction)
- **Sampling**: Log verbose details for 1% of requests (100x reduction)
- **Error-only verbose**: Full details only when errors occur (low volume)
- **Log levels**: DEBUG level disabled in production
- **Exclude sensitive data**: Don't log passwords, tokens, PII

**Cost Savings:**
```
Before: 300M requests × 7KB = 2,100 GB/month
- CloudWatch: 2,100 GB × $0.53 = $1,113/month

After (minimal logging): 300M requests × 200 bytes = 60 GB/month
- CloudWatch: 60 GB × $0.53 = $32/month

After (+ 1% sampling): 60 GB + (2,100 GB × 1%) = 60 + 21 = 81 GB/month
- CloudWatch: 81 GB × $0.53 = $43/month

Savings: $1,113 - $43 = $1,070/month (96% reduction)
```

**Additional Recommendations:**
```typescript
// Compress logs before sending (if using custom log shipper)
import zlib from 'zlib';

const compressedLogs = zlib.gzipSync(JSON.stringify(logBatch));
// Typical compression: 10:1 ratio for text logs

// Use shorter retention for non-critical logs
// CloudWatch: 1 day for debug logs, 30 days for errors, 1 year for audit

// Send verbose logs to S3 (cheaper storage)
// S3: $0.023/GB vs CloudWatch: $0.03/GB (storage)
// S3: No ingestion cost vs CloudWatch: $0.50/GB (ingestion)
```
```

### Example 3: N+1 Database Queries Increase Read Cost

```markdown
### CO-3: N+1 Queries → 100x DynamoDB Read Cost [HIGH]

**Evidence:**
**File:** `src/api/users.ts:67`
```typescript
app.get('/api/users', async (req, res) => {
  // Query 1: Fetch all users
  const users = await db.scan({
    TableName: 'Users',
    Limit: 100
  });

  // Queries 2-101: Fetch profile for each user (N+1)
  for (const user of users.Items) {
    user.profile = await db.get({
      TableName: 'UserProfiles',
      Key: { userId: user.id }
    });
  }

  res.json(users);
});
```

**Cost Impact:**
- **Current Traffic:** 10M requests/day (from CONTEXT)
- **Cost Increase:** +$7,500/month
- **Cost Driver:** DynamoDB Read Capacity Units (RCUs)
- **Scaling:** Linear with request volume

**Cost Calculation:**
```
Traffic: 10M requests/day = 300M requests/month

Per request:
- 1 Scan operation (100 users, 4KB each) = 400KB
  RCUs: 400KB / 4KB = 100 RCUs (eventually consistent)
- 100 GetItem operations (1KB each)
  RCUs: 100 × (1KB / 4KB) = 25 RCUs

Total RCUs per request = 100 + 25 = 125 RCUs

Monthly RCUs = 300M requests × 125 RCUs = 37.5 billion RCUs

DynamoDB pricing: $0.25 per million RCUs
Monthly cost = 37,500 million RCUs × $0.25 = $9,375/month

Current baseline (just users, no profiles): 300M × 100 RCUs = 30 billion RCUs
Current cost = 30,000 million × $0.25 = $7,500/month

Cost increase = $9,375 - $7,500 = $1,875/month

If also include writes (profile updates):
- 1M profile updates/day = 30M/month
- 1KB per write = 1 WCU each
- 30M WCUs × $0.25 per million = $7.50/month (negligible)

Total increase: ~$2,000/month (rounded)

Note: This assumes on-demand pricing. With provisioned capacity:
- Need to provision for peak (not average)
- Peak: 10M req/day / 86400 sec = 116 req/sec
- Peak RCUs: 116 req/sec × 125 RCUs = 14,500 RCUs
- Provisioned: 14,500 RCUs × $0.00013/hr × 730 hr = $1,379/month
- But must handle traffic spikes → overprovision 2x → $2,758/month
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (N+1 queries)
app.get('/api/users', async (req, res) => {
  const users = await db.scan({
    TableName: 'Users',
    Limit: 100
  });

  for (const user of users.Items) {
    user.profile = await db.get({
      TableName: 'UserProfiles',
      Key: { userId: user.id }
    });
  }

  res.json(users);
});

// ✅ AFTER (batch get)
app.get('/api/users', async (req, res) => {
  const users = await db.scan({
    TableName: 'Users',
    Limit: 100
  });

  // Batch get all profiles in one request
  const userIds = users.Items.map(u => u.id);

  const profiles = await db.batchGet({
    RequestItems: {
      UserProfiles: {
        Keys: userIds.map(id => ({ userId: id }))
      }
    }
  });

  // Map profiles to users (O(n) in-memory)
  const profileMap = new Map(
    profiles.Responses.UserProfiles.map(p => [p.userId, p])
  );

  for (const user of users.Items) {
    user.profile = profileMap.get(user.id);
  }

  res.json(users);
});

// 🔥 BEST (denormalize - embed profile in user)
app.get('/api/users', async (req, res) => {
  // Profile data embedded in User table (single query)
  const users = await db.scan({
    TableName: 'Users',
    Limit: 100,
    ProjectionExpression: 'id, #name, email, #profile',
    ExpressionAttributeNames: {
      '#name': 'name',
      '#profile': 'profile'  // Profile data embedded
    }
  });

  res.json(users);
});
```

**Why This Fix:**
- **Batch get**: 1 BatchGetItem request vs 100 GetItem requests
  - DynamoDB BatchGetItem: Up to 100 items per request
  - Reduces round-trips: 101 requests → 2 requests
  - Same RCUs consumed, but much faster

- **Denormalize**: Embed profile data in Users table
  - Single Scan operation: 1 query vs 101 queries
  - Trade-off: More storage, write amplification on updates
  - Best for read-heavy, infrequently updated data

**Cost Savings:**
```
Before: 300M requests × 125 RCUs = 37.5 billion RCUs
- Cost: 37,500 million × $0.25 = $9,375/month

After (batch get): 300M requests × 100 RCUs (scan) + 3M batch requests × 25 RCUs
- Scan: 30 billion RCUs
- Batch: 75 million RCUs (300M / 100 = 3M batch requests)
- Total: 30.075 billion RCUs
- Cost: 30,075 million × $0.25 = $7,519/month

Savings: $9,375 - $7,519 = $1,856/month (20% reduction)

After (denormalize): 300M requests × 100 RCUs = 30 billion RCUs
- Cost: 30,000 million × $0.25 = $7,500/month

Savings: $9,375 - $7,500 = $1,875/month (20% reduction)

Additional latency improvement:
- Before: 101 round-trips × 5ms = 505ms
- After (batch): 2 round-trips × 5ms = 10ms (50x faster)
- After (denormalize): 1 round-trip × 5ms = 5ms (100x faster)
```

**Trade-offs:**
```
Denormalization considerations:
- ✅ Pros: Fewer queries, lower cost, faster
- ❌ Cons: More storage, write amplification, data duplication

When to denormalize:
- Read-heavy workload (100:1 read:write ratio)
- Profile data rarely changes
- Acceptable eventual consistency

When to keep normalized:
- Write-heavy workload
- Profile data changes frequently
- Need strong consistency
```
```

### Example 4: Uncompressed Image Storage

```markdown
### CO-4: Storing Uncompressed Images → $2k/month S3 Cost [MED]

**Evidence:**
**File:** `src/services/upload.ts:34`
```typescript
async function uploadImage(file: Buffer, userId: string) {
  const fileId = uuidv4();

  // ❌ Uploads raw image without compression
  await s3.putObject({
    Bucket: 'user-uploads',
    Key: `images/${userId}/${fileId}.jpg`,
    Body: file,  // ❌ No compression
    ContentType: 'image/jpeg'
  });

  return fileId;
}
```

**Cost Impact:**
- **Current Traffic:** 1M image uploads/day (new feature)
- **Cost Increase:** +$2,000/month
- **Cost Driver:** S3 storage + data transfer
- **Scaling:** Linear with upload volume

**Cost Calculation:**
```
Traffic: 1M uploads/day = 30M uploads/month
Average image size: 3MB (from camera phones)

Storage:
- 30M images × 3MB = 90 TB/month
- Cumulative: 90 TB/month × 12 months = 1,080 TB/year
- S3 Standard: $0.023/GB
- Year 1: 1,080,000 GB × $0.023 = $24,840/year = $2,070/month (average)

Data transfer (users viewing images):
- Assume 50% of images viewed once
- 15M views/month × 3MB = 45 TB egress/month
- S3 egress: $0.09/GB (first 10TB), $0.085/GB (next 40TB)
- 45,000 GB × $0.087 (blended) = $3,915/month

Total: $2,070 + $3,915 = $5,985/month

With compression (80% reduction typical for JPEG):
- Average size: 3MB → 600KB (5x smaller)
- Storage: 1,080 TB → 216 TB
- Storage cost: $4,968/year = $414/month
- Egress: 45 TB → 9 TB
- Egress cost: 9,000 GB × $0.09 = $810/month
- Total: $414 + $810 = $1,224/month

Cost increase (without compression): $5,985/month
Cost increase (with compression): $1,224/month
Savings: $4,761/month (80% reduction)
```

**Severity:** MED
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no compression)
async function uploadImage(file: Buffer, userId: string) {
  const fileId = uuidv4();

  await s3.putObject({
    Bucket: 'user-uploads',
    Key: `images/${userId}/${fileId}.jpg`,
    Body: file,
    ContentType: 'image/jpeg'
  });

  return fileId;
}

// ✅ AFTER (compress before upload)
import sharp from 'sharp';

async function uploadImage(file: Buffer, userId: string) {
  const fileId = uuidv4();

  // Compress image: resize + optimize
  const compressed = await sharp(file)
    .resize(1920, 1080, {
      fit: 'inside',  // Maintain aspect ratio
      withoutEnlargement: true  // Don't upscale small images
    })
    .jpeg({
      quality: 85,  // 85% quality (good balance)
      progressive: true,  // Progressive JPEG (better UX)
      mozjpeg: true  // Use mozjpeg (better compression)
    })
    .toBuffer();

  // Upload compressed image
  await s3.putObject({
    Bucket: 'user-uploads',
    Key: `images/${userId}/${fileId}.jpg`,
    Body: compressed,  // ✅ Compressed
    ContentType: 'image/jpeg',
    CacheControl: 'public, max-age=31536000',  // Cache for 1 year
    StorageClass: 'INTELLIGENT_TIERING'  // Auto-tier to cheaper storage
  });

  return fileId;
}

// Alternative: Store original + generate thumbnails
async function uploadImageWithThumbnails(file: Buffer, userId: string) {
  const fileId = uuidv4();

  // Generate multiple sizes
  const [original, large, medium, thumbnail] = await Promise.all([
    // Original (compressed)
    sharp(file).jpeg({ quality: 90, mozjpeg: true }).toBuffer(),

    // Large (1920x1080)
    sharp(file).resize(1920, 1080, { fit: 'inside' })
      .jpeg({ quality: 85, mozjpeg: true }).toBuffer(),

    // Medium (1280x720)
    sharp(file).resize(1280, 720, { fit: 'inside' })
      .jpeg({ quality: 80, mozjpeg: true }).toBuffer(),

    // Thumbnail (320x240)
    sharp(file).resize(320, 240, { fit: 'cover' })
      .jpeg({ quality: 75, mozjpeg: true }).toBuffer()
  ]);

  // Upload all versions
  await Promise.all([
    s3.putObject({
      Bucket: 'user-uploads',
      Key: `images/${userId}/${fileId}/original.jpg`,
      Body: original,
      StorageClass: 'GLACIER_IR'  // Infrequent access (cheaper)
    }),

    s3.putObject({
      Bucket: 'user-uploads',
      Key: `images/${userId}/${fileId}/large.jpg`,
      Body: large,
      StorageClass: 'STANDARD'
    }),

    s3.putObject({
      Bucket: 'user-uploads',
      Key: `images/${userId}/${fileId}/medium.jpg`,
      Body: medium,
      StorageClass: 'STANDARD'
    }),

    s3.putObject({
      Bucket: 'user-uploads',
      Key: `images/${userId}/${fileId}/thumb.jpg`,
      Body: thumbnail,
      StorageClass: 'STANDARD'
    })
  ]);

  return fileId;
}
```

**Why This Fix:**
- **Compression**: JPEG quality 85% (nearly identical visual, 5x smaller)
- **Resize**: Limit to 1920x1080 (sufficient for web, most phones are 4K+)
- **Progressive JPEG**: Better perceived loading (shows blurry → sharp)
- **mozjpeg**: Better compression algorithm (10-20% smaller than standard)
- **Storage class**: INTELLIGENT_TIERING auto-moves to cheaper tiers
- **Cache control**: 1 year cache (reduce re-downloads)

**Cost Savings:**
```
Before: 30M × 3MB = 90 TB/month, 45 TB egress
- Storage: $2,070/month
- Egress: $3,915/month
- Total: $5,985/month

After (compression): 30M × 600KB = 18 TB/month, 9 TB egress
- Storage: $414/month
- Egress: $810/month
- Total: $1,224/month

Savings: $4,761/month (80% reduction)

Additional savings (storage tiers):
- INTELLIGENT_TIERING: Auto-moves to cheaper tier after 30 days
- Infrequent Access: $0.0125/GB (vs $0.023 Standard) → 46% cheaper
- Glacier Instant Retrieval: $0.004/GB (vs $0.023) → 83% cheaper

If 80% of images not accessed after 30 days:
- 80% × 18 TB = 14.4 TB → GLACIER_IR ($0.004/GB)
- 20% × 18 TB = 3.6 TB → STANDARD ($0.023/GB)
- Storage cost: (14,400 GB × $0.004) + (3,600 GB × $0.023) = $57.6 + $82.8 = $140/month

Total: $140 + $810 = $950/month
Savings: $5,985 - $950 = $5,035/month (84% reduction)
```

**Additional Recommendations:**
```typescript
// Use CloudFront CDN (cheaper egress)
// - S3 egress: $0.09/GB
// - CloudFront: $0.085/GB (cheaper) + edge caching (fewer S3 requests)

// Lifecycle policy: Delete old images
// - Delete after 2 years (if not needed long-term)
// - Or transition to Glacier Deep Archive ($0.00099/GB) for compliance

// WebP format: Better compression than JPEG
// - 30% smaller than JPEG at same quality
// - Supported by all modern browsers
// - Fallback to JPEG for old browsers

await sharp(file)
  .webp({ quality: 85 })
  .toBuffer();
```
```

### Example 5: Cron Job Processing All Records

```markdown
### CO-5: Cron Job Scans Entire Users Table → $10k/month [HIGH]

**Evidence:**
**File:** `src/jobs/sync-users.ts:23`
```typescript
// Runs every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  console.log('Syncing all users to CRM');

  // ❌ Scans entire Users table (1M+ users)
  const users = await db.scan({
    TableName: 'Users'
  });

  for (const user of users.Items) {
    await crmAPI.updateUser(user.id, {
      email: user.email,
      name: user.name,
      plan: user.plan
    });
  }

  console.log(`Synced ${users.Items.length} users`);
});
```

**Cost Impact:**
- **Current Traffic:** 1M users in database
- **Cost Increase:** +$10,000/month
- **Cost Driver:** DynamoDB scans + CRM API calls
- **Scaling:** Linear with user count

**Cost Calculation:**
```
Cron frequency: Every 5 minutes = 288 times/day = 8,640 times/month
Users: 1,000,000

DynamoDB scan cost:
- 1M users × 1KB each = 1 GB per scan
- RCUs: 1,000,000 KB / 4 KB = 250,000 RCUs per scan
- Monthly RCUs: 250,000 × 8,640 = 2.16 billion RCUs
- Cost: 2,160 million × $0.25 per million = $540/month

CRM API cost:
- 1M users × 288 syncs/day = 288M API calls/month
- CRM pricing: $0.001 per API call (example)
- Cost: 288M × $0.001 = $288,000/month

Wait, that's unrealistic. Most CRMs have bulk APIs or rate limits.

Let's assume CRM has bulk API (100 users per call):
- 1M users / 100 = 10,000 bulk API calls per sync
- 10,000 × 288 syncs/month = 2.88M API calls/month
- Cost: 2.88M × $0.01 per call = $28,800/month

Total: $540 + $28,800 = $29,340/month

But this syncs ALL users every 5 minutes (even unchanged ones).

Better approach: Only sync changed users
- Changed users: ~1,000/day (0.1% daily churn)
- DynamoDB query (with GSI on updated_at): 1,000 × 288 = 288,000 queries/month
- RCUs: 288,000 × (1KB / 4KB) = 72,000 RCUs = 0.072M RCUs
- Cost: 0.072M × $0.25 = $0.018/month (negligible)
- CRM API: 1,000 × 288 = 288,000 calls/month
- Cost: 288k × $0.01 = $2,880/month

Total: ~$2,880/month

Cost increase: $29,340 - $2,880 = $26,460/month
```

**Severity:** HIGH
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (scans all users every 5 minutes)
cron.schedule('*/5 * * * *', async () => {
  const users = await db.scan({ TableName: 'Users' });

  for (const user of users.Items) {
    await crmAPI.updateUser(user.id, { email: user.email, ... });
  }
});

// ✅ AFTER (incremental sync - only changed users)
cron.schedule('*/5 * * * *', async () => {
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);

  // Query users updated in last 5 minutes (with GSI)
  const changedUsers = await db.query({
    TableName: 'Users',
    IndexName: 'UpdatedAtIndex',  // GSI on updated_at
    KeyConditionExpression: 'pk = :pk AND updated_at > :timestamp',
    ExpressionAttributeValues: {
      ':pk': 'USER',  // Partition key (if using single-table design)
      ':timestamp': fiveMinutesAgo
    }
  });

  if (changedUsers.Items.length === 0) {
    console.log('No users changed, skipping sync');
    return;
  }

  // Batch update to CRM (100 at a time)
  const batches = chunk(changedUsers.Items, 100);

  for (const batch of batches) {
    await crmAPI.bulkUpdateUsers(
      batch.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        plan: u.plan
      }))
    );
  }

  console.log(`Synced ${changedUsers.Items.length} changed users`);
});

// Alternative: Event-driven sync (best)
// - Use DynamoDB Streams to trigger sync on user changes
// - No polling, instant sync, lowest cost

import { DynamoDBStreamHandler } from 'aws-lambda';

export const handler: DynamoDBStreamHandler = async (event) => {
  const changedUsers = event.Records
    .filter(r => r.eventName === 'MODIFY' || r.eventName === 'INSERT')
    .map(r => r.dynamodb.NewImage);

  if (changedUsers.length === 0) return;

  // Batch update to CRM
  const batches = chunk(changedUsers, 100);

  for (const batch of batches) {
    await crmAPI.bulkUpdateUsers(
      batch.map(u => ({
        id: u.id.S,
        email: u.email.S,
        name: u.name.S,
        plan: u.plan.S
      }))
    );
  }

  console.log(`Synced ${changedUsers.length} users from DynamoDB Stream`);
};
```

**Why This Fix:**
- **Incremental sync**: Only process changed users (1,000/day vs 1M)
  - Query with GSI on `updated_at` field
  - 1000x reduction in data processed

- **Event-driven**: Use DynamoDB Streams (best)
  - No polling (no wasted queries)
  - Instant sync (no 5-minute delay)
  - Only process actual changes

- **Batch API calls**: 100 users per call
  - Reduces API calls by 100x
  - Faster execution

**Cost Savings:**
```
Before: Scan 1M users, 288 times/month
- DynamoDB: 2.16 billion RCUs = $540/month
- CRM API: 2.88M calls = $28,800/month
- Total: $29,340/month

After (incremental): Query 1k changed users, 288 times/month
- DynamoDB: 72,000 RCUs = $0.018/month
- CRM API: 288k calls = $2,880/month
- Total: $2,880/month

Savings: $29,340 - $2,880 = $26,460/month (90% reduction)

After (event-driven): DynamoDB Streams + Lambda
- DynamoDB Streams: $0.02 per 100k read request units
  - 1,000 changes/day × 30 = 30,000 changes/month
  - Cost: 30k / 100k × $0.02 = $0.006/month
- Lambda: 30k invocations × $0.20 per 1M = $0.006/month
- CRM API: 30k changes / 100 batch = 300 calls/month = $3/month
- Total: $3/month

Savings: $29,340 - $3 = $29,337/month (99.99% reduction)
```

**Additional Recommendations:**
```typescript
// Add GSI for updated_at queries
// CloudFormation/Terraform:
GlobalSecondaryIndexes:
  - IndexName: UpdatedAtIndex
    KeySchema:
      - AttributeName: pk
        KeyType: HASH
      - AttributeName: updated_at
        KeyType: RANGE
    Projection:
      ProjectionType: ALL  // Or KEYS_ONLY + specific attributes
    ProvisionedThroughput:
      ReadCapacityUnits: 5
      WriteCapacityUnits: 5

// Update updated_at field on every user modification
async function updateUser(userId: string, updates: Partial<User>) {
  await db.update({
    TableName: 'Users',
    Key: { id: userId },
    UpdateExpression: 'SET #name = :name, updated_at = :now',
    ExpressionAttributeNames: { '#name': 'name' },
    ExpressionAttributeValues: {
      ':name': updates.name,
      ':now': Date.now()
    }
  });
}
```
```

### Example 6: Missing Compression on API Responses

```markdown
### CO-6: No Compression on API Responses → $800/month Egress [MED]

**Evidence:**
**File:** `src/server.ts:12`
```typescript
import express from 'express';

const app = express();

app.use(express.json());

// ❌ No compression middleware

app.get('/api/products', async (req, res) => {
  const products = await db.query('SELECT * FROM products');
  res.json(products);  // 500KB JSON response, uncompressed
});

app.listen(3000);
```

**Cost Impact:**
- **Current Traffic:** 10M requests/day (from CONTEXT)
- **Cost Increase:** +$800/month
- **Cost Driver:** AWS data transfer out (egress)
- **Scaling:** Linear with response size and traffic

**Cost Calculation:**
```
Traffic: 10M requests/day = 300M requests/month
Average response size: 50KB (JSON)

Egress without compression:
- 300M requests × 50KB = 15 TB/month
- AWS egress: $0.09/GB (first 10TB), $0.085/GB (next 40TB)
- 15,000 GB × $0.09 = $1,350/month

Egress with gzip compression (typical 70% reduction for JSON):
- 300M requests × 50KB × 30% = 4.5 TB/month
- 4,500 GB × $0.09 = $405/month

Cost increase: $1,350 - $405 = $945/month

If using CloudFront CDN + compression:
- CloudFront egress: $0.085/GB (slightly cheaper)
- Cache hit rate: 50% (half served from edge, no origin egress)
- Origin egress: 4.5 TB × 50% = 2.25 TB × $0.09 = $203/month
- CloudFront egress: 4.5 TB × $0.085 = $383/month
- Total: $203 + $383 = $586/month

Savings: $1,350 - $586 = $764/month
```

**Severity:** MED
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (no compression)
import express from 'express';

const app = express();

app.use(express.json());

app.get('/api/products', async (req, res) => {
  const products = await db.query('SELECT * FROM products');
  res.json(products);
});

// ✅ AFTER (compression enabled)
import express from 'express';
import compression from 'compression';

const app = express();

// Enable gzip/brotli compression for all responses
app.use(compression({
  level: 6,  // Compression level (0-9, default 6)
  threshold: 1024,  // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }

    // Use default filter (compresses text, JSON, etc.)
    return compression.filter(req, res);
  }
}));

app.use(express.json());

app.get('/api/products', async (req, res) => {
  const products = await db.query('SELECT * FROM products');
  res.json(products);  // Automatically compressed to ~15KB (70% reduction)
});

app.listen(3000);

// Alternative: Use brotli (better compression than gzip)
import shrinkRay from 'shrink-ray-current';  // Supports brotli

app.use(shrinkRay({
  brotli: {
    quality: 5  // Brotli quality (0-11, higher = better compression + slower)
  },
  zlib: {
    level: 6  // Gzip fallback for old clients
  },
  threshold: 1024
}));
```

**Why This Fix:**
- **Gzip compression**: 70% reduction for text/JSON (typical)
  - 50KB → 15KB (3.3x smaller)
  - CPU overhead negligible (<1ms)
  - Supported by all modern browsers

- **Brotli compression**: 80% reduction (better than gzip)
  - 50KB → 10KB (5x smaller)
  - Slightly more CPU (still negligible)
  - Supported by modern browsers (95%+ coverage)

- **Threshold**: Only compress responses >1KB
  - Tiny responses (<1KB) not worth compressing
  - Compression overhead > savings for small responses

**Cost Savings:**
```
Before: 300M × 50KB = 15 TB/month egress
- Cost: $1,350/month

After (gzip): 300M × 15KB = 4.5 TB/month egress
- Cost: $405/month

Savings: $945/month (70% reduction)

After (brotli): 300M × 10KB = 3 TB/month egress
- Cost: $270/month

Savings: $1,080/month (80% reduction)
```

**Performance Impact:**
```
Compression overhead:
- CPU: 0.5-1ms per request (negligible)
- Memory: ~50KB per active compression (pooled)

Network savings:
- 50KB uncompressed → 15KB gzipped
- Download time: 50KB / 5 Mbps = 80ms → 15KB / 5 Mbps = 24ms
- Savings: 56ms per request (70% faster download)

User experience:
- Faster page loads (especially mobile)
- Less data usage (mobile data plans)
```

**Additional Recommendations:**
```typescript
// Pre-compress static assets at build time (even better)
// - Webpack/Vite/etc. can generate .gz and .br files
// - Nginx/CloudFront serve pre-compressed files (zero CPU overhead)

// CloudFront automatic compression:
// - Enable "Compress Objects Automatically" in CloudFront
// - Free, no origin server CPU usage
// - Supports gzip and brotli

// Set proper Cache-Control headers (reduce egress)
app.get('/api/products', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');  // Cache 5 minutes
  const products = await db.query('SELECT * FROM products');
  res.json(products);
});
// With 50% cache hit rate → 50% less egress
```
```

### Example 7: Third-Party AI API in Hot Path

```markdown
### CO-7: GPT-4 Call on Every Message → $30k/month [BLOCKER]

**Evidence:**
**File:** `src/api/chat.ts:45`
```typescript
app.post('/api/chat/message', async (req, res) => {
  const { message, userId } = req.body;

  // ❌ Calls GPT-4 for every single message (expensive)
  const response = await openai.chat.completions.create({
    model: 'gpt-4',  // ❌ Most expensive model
    messages: [
      { role: 'user', content: message }
    ],
    max_tokens: 500
  });

  await db.insert({
    table: 'messages',
    data: {
      user_id: userId,
      message,
      response: response.choices[0].message.content
    }
  });

  res.json({ response: response.choices[0].message.content });
});
```

**Cost Impact:**
- **Current Traffic:** 1M messages/day
- **Cost Increase:** +$30,000/month
- **Cost Driver:** OpenAI GPT-4 API calls
- **Scaling:** Linear with message volume

**Cost Calculation:**
```
Traffic: 1M messages/day = 30M messages/month

GPT-4 pricing:
- Input: $0.03 per 1k tokens
- Output: $0.06 per 1k tokens

Average usage:
- Input: 50 tokens per message (typical user message)
- Output: 200 tokens per response (generated response)

Cost per message:
- Input: (50 / 1000) × $0.03 = $0.0015
- Output: (200 / 1000) × $0.06 = $0.012
- Total: $0.0135 per message

Monthly cost: 30M messages × $0.0135 = $405,000/month

Wait, that's huge. Let's optimize.

With caching (10% cache hit rate for similar questions):
- Cache hits: 30M × 10% = 3M (free)
- API calls: 30M × 90% = 27M
- Cost: 27M × $0.0135 = $364,500/month

With cheaper model (GPT-3.5-turbo for simple queries):
- GPT-3.5-turbo pricing: $0.0005 per 1k input, $0.0015 per 1k output
- Cost per message: (50 / 1000) × $0.0005 + (200 / 1000) × $0.0015 = $0.000325
- 80% simple queries → GPT-3.5: 24M × $0.000325 = $7,800/month
- 20% complex queries → GPT-4: 6M × $0.0135 = $81,000/month
- Total: $88,800/month

With caching + cheaper model:
- Cache: 30M × 10% = 3M (free)
- GPT-3.5: 27M × 80% = 21.6M × $0.000325 = $7,020/month
- GPT-4: 27M × 20% = 5.4M × $0.0135 = $72,900/month
- Total: $79,920/month

Cost increase: $405,000 - $79,920 = $325,080/month savings (80% reduction)

But still expensive. Better approach:
- Cache: 50% hit rate (better caching strategy) = 15M free
- GPT-3.5: 13.5M × $0.000325 = $4,388/month
- GPT-4: 1.5M × $0.0135 = $20,250/month
- Total: $24,638/month

Final cost increase: ~$25,000/month
```

**Severity:** BLOCKER
**Confidence:** High

**Remediation:**
```typescript
// ❌ BEFORE (GPT-4 for everything, no caching)
app.post('/api/chat/message', async (req, res) => {
  const { message, userId } = req.body;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }],
    max_tokens: 500
  });

  res.json({ response: response.choices[0].message.content });
});

// ✅ AFTER (caching + cheaper model for simple queries)
import crypto from 'crypto';

// Semantic cache (hash similar messages)
function getCacheKey(message: string): string {
  // Normalize: lowercase, trim, remove punctuation
  const normalized = message.toLowerCase().trim().replace(/[^\w\s]/g, '');
  return crypto.createHash('md5').update(normalized).digest('hex');
}

app.post('/api/chat/message', async (req, res) => {
  const { message, userId } = req.body;

  // 1. Check cache
  const cacheKey = getCacheKey(message);
  const cached = await redis.get(`chat:${cacheKey}`);

  if (cached) {
    console.log('Cache hit');
    return res.json({ response: JSON.parse(cached), cached: true });
  }

  // 2. Classify query complexity (use cheap model or heuristics)
  const isComplex = await classifyQueryComplexity(message);

  // 3. Use appropriate model
  const model = isComplex ? 'gpt-4' : 'gpt-3.5-turbo';

  const response = await openai.chat.completions.create({
    model,
    messages: [{ role: 'user', content: message }],
    max_tokens: 500,
    temperature: 0.7
  });

  const result = response.choices[0].message.content;

  // 4. Cache result (TTL: 1 hour)
  await redis.setex(`chat:${cacheKey}`, 3600, JSON.stringify(result));

  res.json({ response: result, model, cached: false });
});

// Classify query complexity (heuristic or small model)
async function classifyQueryComplexity(message: string): Promise<boolean> {
  // Heuristic approach (fast, free)
  const complexKeywords = [
    'explain', 'analyze', 'compare', 'why', 'how does',
    'detailed', 'comprehensive', 'in-depth'
  ];

  const isComplex = complexKeywords.some(kw =>
    message.toLowerCase().includes(kw)
  );

  if (isComplex) return true;

  // For other cases, use cheap model to classify
  // Or use embeddings similarity (even cheaper)

  return false;  // Default to simple
}

// Alternative: Use embeddings for semantic search (cheapest)
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

const vectorStore = new MemoryVectorStore(new OpenAIEmbeddings());

// Pre-populate common Q&A pairs
await vectorStore.addDocuments([
  { pageContent: 'What is your return policy?', metadata: { answer: '30 days' } },
  { pageContent: 'How do I reset my password?', metadata: { answer: 'Click Forgot Password' } },
  // ... hundreds of common questions
]);

app.post('/api/chat/message', async (req, res) => {
  const { message } = req.body;

  // 1. Semantic search for similar questions (cheap)
  const similar = await vectorStore.similaritySearch(message, 1);

  if (similar.length > 0 && similar[0].score > 0.9) {
    // High similarity → return cached answer
    return res.json({
      response: similar[0].metadata.answer,
      cached: true
    });
  }

  // 2. No match → use LLM (expensive)
  // ... GPT call as above
});
```

**Why This Fix:**
- **Caching**: Avoid repeated API calls for similar questions
  - 50% cache hit rate → 50% cost reduction
  - Redis cache: <$50/month (negligible vs API costs)

- **Model selection**: Use cheaper model for simple queries
  - GPT-3.5-turbo: 25x cheaper than GPT-4
  - 80% of queries are simple → 80% use cheap model

- **Semantic search**: Pre-compute answers for common questions
  - Embeddings: $0.0001 per 1k tokens (100x cheaper than GPT-4)
  - Vector search: Milliseconds (fast)

**Cost Savings:**
```
Before: 30M messages × GPT-4
- Cost: 30M × $0.0135 = $405,000/month

After (caching 50% + model selection 80% GPT-3.5):
- Cache hits: 15M (free)
- GPT-3.5: 12M × $0.000325 = $3,900/month
- GPT-4: 3M × $0.0135 = $40,500/month
- Total: $44,400/month

Savings: $405,000 - $44,400 = $360,600/month (89% reduction)

After (+ semantic search for common questions):
- Semantic search: 20M × $0.00001 = $200/month
- Cache: 5M (free)
- GPT-3.5: 4M × $0.000325 = $1,300/month
- GPT-4: 1M × $0.0135 = $13,500/month
- Total: $15,000/month

Savings: $405,000 - $15,000 = $390,000/month (96% reduction)
```

**Additional Recommendations:**
```typescript
// Rate limiting per user (prevent abuse)
app.post('/api/chat/message', async (req, res) => {
  const { userId } = req.body;

  // Check rate limit (10 messages/minute per user)
  const count = await redis.incr(`ratelimit:${userId}`);
  if (count === 1) {
    await redis.expire(`ratelimit:${userId}`, 60);
  }

  if (count > 10) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  // ... GPT call
});

// Streaming responses (better UX, same cost)
const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: message }],
  stream: true  // Stream response as it's generated
});

res.setHeader('Content-Type', 'text/event-stream');

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
}

res.end();

// Budget alerts (set monthly spend limit)
const MONTHLY_BUDGET = 50000;  // $50k/month

const currentSpend = await getMonthlyOpenAISpend();

if (currentSpend > MONTHLY_BUDGET) {
  // Pause API calls, send alert
  await sendAlert('OpenAI budget exceeded', { currentSpend, budget: MONTHLY_BUDGET });
  return res.status(503).json({ error: 'Service temporarily unavailable' });
}
```
```

---

## Notes

- **Read full function context**: Always read the entire function/method, not just diff lines
- **Calculate real costs**: Use pricing from cloud provider + traffic volume from CONTEXT
- **Show scaling**: Demonstrate how cost grows with traffic/data
- **Evidence-first**: Every finding must have file:line + code snippet
- **Actionable remediation**: Provide complete before/after code with cost calculations
- **Cross-reference CONTEXT**: Use traffic volume and cost centers to prioritize
- **Hidden multipliers**: Look for loops, cron frequencies, per-item operations
- **False positives welcome**: Encourage users to challenge cost estimates
