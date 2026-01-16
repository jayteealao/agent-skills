---
name: telemetry-audit
description: Audit telemetry for secrets/PII leaks, metric cardinality explosion, cost optimization, and wide-event compliance
usage: /telemetry-audit [SCOPE] [TARGET]
arguments:
  - name: SCOPE
    description: 'Audit scope: logs | metrics | traces | all'
    required: false
    default: all
  - name: TARGET
    description: 'Target: service name, file path, or time range'
    required: false
examples:
  - command: /telemetry-audit logs "payment-api"
    description: Audit logs for payment API service
  - command: /telemetry-audit metrics
    description: Audit all metrics for cardinality issues
  - command: /telemetry-audit all "src/services/**"
    description: Audit all telemetry in services directory
---

# Telemetry Audit

You are a telemetry auditor who ensures observability is **safe, cost-effective, and compliant** with the wide-event philosophy. You audit for:
1. **Safety**: Secrets/PII in logs/metrics/traces
2. **Cost**: High-cardinality metrics, excessive log volume
3. **Quality**: Wide-event patterns, signal-to-noise ratio
4. **Compliance**: Data retention, PII regulations
5. **Performance**: Hot-path logging overhead

## Philosophy: Wide Events + Cost Efficiency

**From loggingsucks.com philosophy:**
- ONE comprehensive event per request (not scattered logs)
- Emit AFTER completion (tail sampling)
- Include business context (tier, flags, cart)
- Sample intelligently (100% errors, 1-10% success)

**Cost efficiency:**
- Logs cost $0.50-$2.00 per GB ingested
- Metrics cost by cardinality (unique label combinations)
- Traces cost per span
- **Audit finds waste and security issues**

## Step 1: Understand Audit Scope

If `SCOPE` and `TARGET` provided, parse them. Otherwise, ask:

**Interactive prompts:**
1. **What to audit?** (logs, metrics, traces, all)
2. **Which services?** (all, specific service, file paths)
3. **Time range?** (last 24h, last 7d, last 30d)
4. **Focus areas?** (security, cost, quality, compliance)

**Gather context:**
- Log aggregation system (Datadog, Splunk, ELK)
- Metrics system (Prometheus, Datadog, CloudWatch)
- Tracing system (Jaeger, Zipkin, Datadog APM)
- Monthly telemetry bill (if known)
- Recent security incidents
- Data retention policies

## Step 2: Security Audit (Secrets & PII Detection)

**Goal:** Find leaked secrets and PII before attackers do.

### Category 1: Secrets Detection

**CRITICAL if found:**
- [ ] API keys (Stripe, AWS, Twilio, SendGrid)
- [ ] JWT tokens (full token, not just header)
- [ ] Database passwords
- [ ] OAuth client secrets
- [ ] Private keys / certificates
- [ ] Session tokens
- [ ] Authorization headers
- [ ] Webhook signing secrets

**Detection patterns (regex):**

```typescript
// scripts/audit-secrets.ts
import { Grep } from './tools';

const SECRET_PATTERNS = {
  stripe_key: /sk_(live|test)_[a-zA-Z0-9]{24,}/,
  aws_key: /AKIA[0-9A-Z]{16}/,
  jwt_token: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
  bearer_token: /Bearer\s+[a-zA-Z0-9_-]{20,}/,
  api_key: /[Aa][Pp][Ii][-_]?[Kk][Ee][Yy]\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/,
  password: /[Pp]assword\s*[:=]\s*['"]?([^'"]{8,})['"]?/,
  private_key: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  oauth_secret: /[Cc]lient[-_]?[Ss]ecret\s*[:=]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/,
  connection_string: /postgres:\/\/[^:]+:([^@]+)@/,
  credit_card: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/,
};

interface SecretFinding {
  pattern: string;
  file: string;
  line: number;
  context: string;
  severity: 'CRITICAL' | 'HIGH';
}

async function auditSecretsInCode(): Promise<SecretFinding[]> {
  const findings: SecretFinding[] = [];

  for (const [name, pattern] of Object.entries(SECRET_PATTERNS)) {
    console.log(`Scanning for: ${name}`);

    const results = await Grep({
      pattern: pattern.source,
      path: 'src/',
      output_mode: 'content',
      '-n': true,
      '-C': 2, // 2 lines context
    });

    for (const result of results) {
      findings.push({
        pattern: name,
        file: result.file,
        line: result.line,
        context: result.content,
        severity: ['stripe_key', 'aws_key', 'private_key'].includes(name)
          ? 'CRITICAL'
          : 'HIGH',
      });
    }
  }

  return findings;
}

async function auditSecretsInLogs(service: string, hours: number = 24): Promise<SecretFinding[]> {
  // Query log aggregation system
  // Example: Datadog Logs API

  const findings: SecretFinding[] = [];
  const patterns = Object.entries(SECRET_PATTERNS);

  for (const [name, pattern] of patterns) {
    console.log(`Scanning logs for: ${name}`);

    // Datadog query
    const query = `service:${service} -source:redacted`;
    const logs = await fetch('https://api.datadoghq.com/api/v2/logs/events/search', {
      method: 'POST',
      headers: {
        'DD-API-KEY': process.env.DD_API_KEY!,
        'DD-APPLICATION-KEY': process.env.DD_APP_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          query,
          from: `now-${hours}h`,
          to: 'now',
        },
        page: { limit: 1000 },
      }),
    }).then(r => r.json());

    for (const log of logs.data || []) {
      const message = JSON.stringify(log.attributes);

      if (pattern.test(message)) {
        findings.push({
          pattern: name,
          file: `logs/${service}`,
          line: 0,
          context: message.slice(0, 200),
          severity: 'CRITICAL',
        });
      }
    }
  }

  return findings;
}

// Generate audit report
async function generateSecretAuditReport() {
  const codeFindings = await auditSecretsInCode();
  const logFindings = await auditSecretsInLogs('payment-api', 24);

  const allFindings = [...codeFindings, ...logFindings];

  console.log('\n=== SECRET AUDIT REPORT ===\n');
  console.log(`Total findings: ${allFindings.length}`);
  console.log(`CRITICAL: ${allFindings.filter(f => f.severity === 'CRITICAL').length}`);
  console.log(`HIGH: ${allFindings.filter(f => f.severity === 'HIGH').length}`);

  // Group by pattern
  const byPattern = allFindings.reduce((acc, f) => {
    acc[f.pattern] = (acc[f.pattern] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('\nFindings by pattern:');
  Object.entries(byPattern)
    .sort(([, a], [, b]) => b - a)
    .forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count}`);
    });

  // Print details
  console.log('\nDetailed findings:');
  allFindings.forEach((f, i) => {
    console.log(`\n${i + 1}. [${f.severity}] ${f.pattern}`);
    console.log(`   File: ${f.file}:${f.line}`);
    console.log(`   Context: ${f.context.replace(/\n/g, ' ')}`);
  });

  return allFindings;
}
```

**Example: Find secrets in logs**

```bash
# Search Datadog logs for API keys
curl -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "query": "service:payment-api (stripe OR AKIA OR eyJ)",
      "from": "now-24h",
      "to": "now"
    }
  }'

# Search for Authorization headers
curl -X POST "https://api.datadoghq.com/api/v2/logs/events/search" \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -H "DD-APPLICATION-KEY: ${DD_APP_KEY}" \
  -d '{
    "filter": {
      "query": "service:payment-api @http.headers.authorization:*",
      "from": "now-7d",
      "to": "now"
    }
  }'
```

**Example: Secrets found in production logs**

```json
{
  "severity": "CRITICAL",
  "findings": [
    {
      "pattern": "stripe_key",
      "location": "payment-api logs (2024-01-15 14:23:45)",
      "context": "Stripe API call failed: {api_key: 'sk_live_abc123...', error: '...'}",
      "risk": "Stripe API key exposed in logs. Anyone with log access can charge cards.",
      "remediation": [
        "1. Rotate Stripe API key immediately: https://dashboard.stripe.com/apikeys",
        "2. Audit log access: who viewed logs in last 30 days?",
        "3. Fix code: redact api_key field in error logs",
        "4. Add regex filter in log aggregator to block secrets"
      ]
    },
    {
      "pattern": "jwt_token",
      "location": "auth-api logs (2024-01-15 12:34:56)",
      "context": "User login: {email: 'user@example.com', token: 'eyJhbGc...'}",
      "risk": "JWT tokens allow account takeover. Exposed for 100+ users.",
      "remediation": [
        "1. Invalidate all tokens issued in last 24h (force re-login)",
        "2. Fix code: only log token header/payload, not signature",
        "3. Add monitoring: alert on 'eyJ' in logs"
      ]
    },
    {
      "pattern": "password",
      "location": "src/controllers/auth.ts:45",
      "context": "logger.debug('Login attempt', {email, password})",
      "risk": "Plaintext passwords in logs. Security breach if logs compromised.",
      "remediation": [
        "1. Remove password from debug logs (never log passwords)",
        "2. Audit logs: search for exposed passwords, notify affected users",
        "3. Force password reset for affected accounts"
      ]
    }
  ]
}
```

### Category 2: PII Detection

**HIGH if found:**
- [ ] Email addresses
- [ ] Full names
- [ ] Physical addresses
- [ ] Phone numbers
- [ ] IP addresses (consider GDPR)
- [ ] Geolocation (precise)
- [ ] User-generated content with PII

**Detection patterns:**

```typescript
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phone_us: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
  phone_intl: /\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/,
  ip_address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  full_name: /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Weak pattern, many false positives
  address: /\d+\s+[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/,
};

async function auditPIIInLogs(service: string): Promise<PIIFinding[]> {
  const findings: PIIFinding[] = [];

  for (const [name, pattern] of Object.entries(PII_PATTERNS)) {
    const query = `service:${service}`;
    const logs = await fetchLogs(query, '24h');

    for (const log of logs) {
      const message = JSON.stringify(log);

      const matches = message.match(new RegExp(pattern, 'g'));
      if (matches && matches.length > 0) {
        findings.push({
          pattern: name,
          service,
          count: matches.length,
          sample: matches.slice(0, 3),
          severity: ['email', 'phone_us', 'phone_intl'].includes(name) ? 'HIGH' : 'MEDIUM',
        });
      }
    }
  }

  return findings;
}
```

**Example: PII audit report**

```markdown
## PII Exposure Report

**Service:** payment-api
**Time range:** Last 7 days
**Total logs scanned:** 1.2M

### Findings

**HIGH: Email addresses in logs**
- Count: 45,234 occurrences
- Sample: `user@example.com`, `john.doe@company.com`
- Location: User registration, password reset, payment logs
- GDPR risk: Yes (personal data, right to deletion)
- Recommendation:
  - Hash emails: `sha256(email).slice(0, 16)`
  - Or use user_id instead
  - Update retention: delete logs after 30 days

**HIGH: Phone numbers in logs**
- Count: 12,456 occurrences
- Sample: `555-123-4567`, `+1-555-987-6543`
- Location: SMS verification logs
- GDPR risk: Yes
- Recommendation:
  - Redact middle digits: `555-***-4567`
  - Or remove entirely

**MEDIUM: IP addresses in logs**
- Count: 1.2M occurrences (every request)
- Sample: `192.168.1.100`, `203.0.113.45`
- Location: HTTP access logs
- GDPR risk: Maybe (IP is personal data in EU)
- Recommendation:
  - Hash IPs: `sha256(ip).slice(0, 16)`
  - Or anonymize last octet: `192.168.1.0`
  - Keep raw IPs for fraud detection (justify under legitimate interest)

**Cost impact:**
- PII adds ~30% to log volume
- Estimated cost: $450/month for unnecessary PII logging
- Recommendation: Remove PII, save $5,400/year
```

### Category 3: Compliance Check

**Required by GDPR/CCPA:**
- [ ] Data retention policy (30-90 days for logs)
- [ ] Right to deletion (can you delete user's logs?)
- [ ] Data processing agreement (with log vendor)
- [ ] Data encryption (at rest and in transit)
- [ ] Access controls (who can view logs?)

**Audit questions:**
1. Can you delete a user's logs on request? (GDPR right to deletion)
2. Do you log the minimum necessary PII? (GDPR data minimization)
3. Do you have legal basis for logging PII? (GDPR Article 6)
4. Are logs encrypted at rest? (GDPR security requirement)
5. Do you audit log access? (GDPR accountability)

## Step 3: Cost Audit (Cardinality & Volume)

**Goal:** Find telemetry waste costing thousands per month.

### Category 1: Metric Cardinality Explosion

**Problem:** High-cardinality labels create millions of unique time series.

**Cost impact:**
- Prometheus: 1M time series = 1GB RAM
- Datadog: $5 per 100 custom metrics (unique label combinations)
- CloudWatch: $0.30 per metric per month

**Detection:**

```typescript
// scripts/audit-metric-cardinality.ts

interface MetricCardinality {
  metric: string;
  cardinality: number;
  labels: Record<string, number>;
  cost_estimate_monthly: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

async function auditMetricCardinality(): Promise<MetricCardinality[]> {
  // Query Prometheus for cardinality
  const response = await fetch('http://prometheus:9090/api/v1/label/__name__/values');
  const metrics = await response.json();

  const cardinalityReport: MetricCardinality[] = [];

  for (const metric of metrics.data) {
    // Get cardinality (unique label combinations)
    const cardQuery = `count({__name__="${metric}"}) by (__name__)`;
    const cardResponse = await fetch(
      `http://prometheus:9090/api/v1/query?query=${encodeURIComponent(cardQuery)}`
    );
    const cardData = await cardResponse.json();
    const cardinality = parseInt(cardData.data.result[0]?.value[1] || '0');

    // Get label cardinality
    const labelsQuery = `{__name__="${metric}"}`;
    const labelsResponse = await fetch(
      `http://prometheus:9090/api/v1/series?match[]=${encodeURIComponent(labelsQuery)}`
    );
    const labelsData = await labelsResponse.json();

    const labelCounts: Record<string, Set<string>> = {};
    for (const series of labelsData.data) {
      for (const [label, value] of Object.entries(series)) {
        if (label === '__name__') continue;
        if (!labelCounts[label]) labelCounts[label] = new Set();
        labelCounts[label].add(value as string);
      }
    }

    const labelCardinality = Object.fromEntries(
      Object.entries(labelCounts).map(([label, values]) => [label, values.size])
    );

    // Estimate cost (Datadog pricing: $5 per 100 custom metrics)
    const costEstimate = (cardinality / 100) * 5;

    cardinalityReport.push({
      metric,
      cardinality,
      labels: labelCardinality,
      cost_estimate_monthly: costEstimate,
      severity:
        cardinality > 10000 ? 'CRITICAL' :
        cardinality > 1000 ? 'HIGH' :
        cardinality > 100 ? 'MEDIUM' : 'LOW',
    });
  }

  return cardinalityReport.sort((a, b) => b.cardinality - a.cardinality);
}

// Generate report
async function generateCardinalityReport() {
  const report = await auditMetricCardinality();

  console.log('\n=== METRIC CARDINALITY REPORT ===\n');

  const totalCardinality = report.reduce((sum, m) => sum + m.cardinality, 0);
  const totalCost = report.reduce((sum, m) => sum + m.cost_estimate_monthly, 0);

  console.log(`Total metrics: ${report.length}`);
  console.log(`Total cardinality: ${totalCardinality.toLocaleString()}`);
  console.log(`Estimated monthly cost: $${totalCost.toFixed(2)}`);
  console.log();

  const critical = report.filter(m => m.severity === 'CRITICAL');
  console.log(`CRITICAL (>10k cardinality): ${critical.length} metrics`);
  console.log(`  Cost: $${critical.reduce((s, m) => s + m.cost_estimate_monthly, 0).toFixed(2)}/mo`);

  console.log('\nTop 10 high-cardinality metrics:');
  report.slice(0, 10).forEach((m, i) => {
    console.log(`\n${i + 1}. ${m.metric}`);
    console.log(`   Cardinality: ${m.cardinality.toLocaleString()} [${m.severity}]`);
    console.log(`   Cost: $${m.cost_estimate_monthly.toFixed(2)}/mo`);
    console.log(`   Labels:`);
    Object.entries(m.labels)
      .sort(([, a], [, b]) => b - a)
      .forEach(([label, count]) => {
        console.log(`     ${label}: ${count} unique values`);
      });
  });
}
```

**Example: Cardinality explosion found**

```markdown
## Metric Cardinality Report

**Total cardinality:** 2.4M time series
**Estimated cost:** $12,000/month
**Top offenders:**

### CRITICAL: http.request.duration (1.2M cardinality)

**Problem:** Unbounded labels
- `user_id`: 500,000 unique users
- `endpoint`: 2,400 unique endpoints (includes UUIDs!)

**Cost:** $6,000/month

**Root cause:**
```typescript
// ❌ BAD: User ID as label (unbounded cardinality)
metrics.histogram('http.request.duration', duration, {
  user_id: req.user.id,          // 500k unique values
  endpoint: req.path,             // 2.4k unique values
  status_code: res.statusCode,
});

// Cardinality = 500k × 2.4k × 5 = 6 BILLION potential combinations!
```

**Fix:**
```typescript
// ✅ GOOD: Bounded labels only
metrics.histogram('http.request.duration', duration, {
  endpoint: normalizeEndpoint(req.path), // /users/:id → /users/{id}
  status_code: res.statusCode,
  method: req.method,
});

// Cardinality = 100 endpoints × 10 status codes × 5 methods = 5,000
// Cost: $250/month (96% savings!)

// Log user_id in structured logs instead
logger.info('http_request', {
  user_id: req.user.id,
  endpoint: req.path,
  duration_ms: duration,
});
```

**Savings:** $5,750/month

### HIGH: cache.hit_rate (45k cardinality)

**Problem:** Cache key as label
- `cache_key`: 45,000 unique keys

**Root cause:**
```typescript
// ❌ BAD: Cache key as label
metrics.gauge('cache.hit_rate', hitRate, {
  cache_key: key, // "user:12345:profile", "session:abc:data"
});
```

**Fix:**
```typescript
// ✅ GOOD: Aggregate by cache type
function getCacheType(key: string): string {
  if (key.startsWith('user:')) return 'user';
  if (key.startsWith('session:')) return 'session';
  if (key.startsWith('product:')) return 'product';
  return 'other';
}

metrics.gauge('cache.hit_rate', hitRate, {
  cache_type: getCacheType(key), // 4 unique values
});
```

**Savings:** $2,200/month

### Cardinality Best Practices

**Safe labels (bounded cardinality):**
- ✅ Status code (5-10 values)
- ✅ HTTP method (5 values)
- ✅ Service name (10-100 values)
- ✅ Environment (3-5 values)
- ✅ Region (5-20 values)
- ✅ Endpoint (normalized: `/users/{id}`, not `/users/12345`)

**Dangerous labels (unbounded cardinality):**
- ❌ User ID (thousands to millions)
- ❌ Session ID (millions)
- ❌ Request ID (millions)
- ❌ Email address (thousands)
- ❌ UUID in endpoint (`/orders/a1b2c3...`)
- ❌ Timestamp (infinite)
- ❌ Cache key (thousands)
- ❌ SQL query (thousands)

**Rule of thumb:**
- Cardinality < 100: SAFE
- Cardinality 100-1000: OK (monitor)
- Cardinality 1000-10000: HIGH (optimize)
- Cardinality > 10000: CRITICAL (fix immediately)
```

### Category 2: Log Volume & Cost

**Detection:**

```typescript
// scripts/audit-log-volume.ts

interface LogVolume {
  service: string;
  volume_gb: number;
  cost_estimate_monthly: number;
  log_level_breakdown: Record<string, number>;
  top_events: Array<{ event: string; count: number; percent: number }>;
}

async function auditLogVolume(days: number = 7): Promise<LogVolume[]> {
  const services = await getServices(); // List all services

  const report: LogVolume[] = [];

  for (const service of services) {
    // Query log volume
    const volumeQuery = `service:${service}`;
    const volume = await fetchLogVolume(volumeQuery, `${days}d`);

    // Extrapolate to monthly cost
    const monthlyGB = (volume.bytes / 1024 / 1024 / 1024) * (30 / days);
    const monthlyCost = monthlyGB * 1.27; // Datadog: $1.27/GB

    // Get log level breakdown
    const levels = await fetchLogLevels(service, `${days}d`);

    // Get top events (most frequent logs)
    const events = await fetchTopEvents(service, `${days}d`, 20);

    report.push({
      service,
      volume_gb: monthlyGB,
      cost_estimate_monthly: monthlyCost,
      log_level_breakdown: levels,
      top_events: events,
    });
  }

  return report.sort((a, b) => b.volume_gb - a.volume_gb);
}

async function generateLogVolumeReport() {
  const report = await auditLogVolume(7);

  console.log('\n=== LOG VOLUME REPORT ===\n');

  const totalVolume = report.reduce((sum, s) => sum + s.volume_gb, 0);
  const totalCost = report.reduce((sum, s) => sum + s.cost_estimate_monthly, 0);

  console.log(`Total log volume: ${totalVolume.toFixed(2)} GB/month`);
  console.log(`Estimated cost: $${totalCost.toFixed(2)}/month`);
  console.log();

  console.log('Top 10 services by volume:');
  report.slice(0, 10).forEach((s, i) => {
    console.log(`\n${i + 1}. ${s.service}`);
    console.log(`   Volume: ${s.volume_gb.toFixed(2)} GB/mo`);
    console.log(`   Cost: $${s.cost_estimate_monthly.toFixed(2)}/mo`);
    console.log(`   Log levels:`);
    Object.entries(s.log_level_breakdown)
      .sort(([, a], [, b]) => b - a)
      .forEach(([level, count]) => {
        const percent = (count / Object.values(s.log_level_breakdown).reduce((a, b) => a + b, 0) * 100);
        console.log(`     ${level}: ${count.toLocaleString()} (${percent.toFixed(1)}%)`);
      });

    console.log(`   Top events:`);
    s.top_events.slice(0, 5).forEach((e, j) => {
      console.log(`     ${j + 1}. ${e.event}: ${e.count.toLocaleString()} (${e.percent.toFixed(1)}%)`);
    });
  });
}
```

**Example: Log cost optimization**

```markdown
## Log Volume Report

**Total volume:** 450 GB/month
**Total cost:** $571/month
**Optimization potential:** $280/month (49% savings)

### Service: payment-api (180 GB/mo, $229/mo)

**Problem: 80% DEBUG logs in production**

**Log level breakdown:**
- DEBUG: 144 GB (80%) ← Should be 0% in prod
- INFO: 27 GB (15%)
- WARN: 7.2 GB (4%)
- ERROR: 1.8 GB (1%)

**Top events (noise):**
1. `payment_validation_start`: 45M logs/day
2. `database_query_executed`: 30M logs/day
3. `cache_lookup`: 20M logs/day

**Root cause:**
```typescript
// ❌ BAD: DEBUG logs in hot path
app.post('/api/payment', async (req, res) => {
  logger.debug('payment_validation_start', { body: req.body });

  const user = await db.users.findById(req.body.userId);
  logger.debug('database_query_executed', { query: 'users.findById', result: user });

  const cached = await cache.get(`user:${user.id}`);
  logger.debug('cache_lookup', { key: `user:${user.id}`, hit: !!cached });

  // ... 10 more DEBUG logs per request ...
});

// 1M requests/day × 13 DEBUG logs = 13M logs/day = 144 GB/month
```

**Fix: Wide-event pattern**
```typescript
// ✅ GOOD: ONE event after completion
app.post('/api/payment', async (req, res) => {
  const startTime = Date.now();

  try {
    const result = await processPayment(req.body);

    // Emit ONE comprehensive event (not 13 scattered logs)
    logger.info('payment_processed', {
      request_id: req.id,
      user_id: req.body.userId,
      amount_cents: req.body.amount,
      duration_ms: Date.now() - startTime,
      status: 'success',

      // Business context
      user_tier: user.subscription,
      payment_method: req.body.method,

      // Performance insights
      db_queries: 3,
      cache_hits: 2,
      cache_misses: 1,
    });

    res.json(result);
  } catch (error) {
    // Only log errors (not debug steps)
    logger.error('payment_failed', {
      request_id: req.id,
      user_id: req.body.userId,
      error_type: error.constructor.name,
      error_message: error.message,
      duration_ms: Date.now() - startTime,
    });

    throw error;
  }
});

// 1M requests/day × 1 log = 1M logs/day = 11 GB/month
// Savings: 144 GB → 11 GB (92% reduction!)
```

**Savings:** $170/month for payment-api

**Additional optimization: Sampling**
```typescript
// Sample successful requests (keep 100% errors, 10% success)
if (status === 'success' && Math.random() > 0.1) {
  return; // Don't log
}

logger.info('payment_processed', { ... });

// Further savings: 11 GB → 2 GB (80% reduction)
```

**Total savings:** $215/month for payment-api

### Service: frontend-api (120 GB/mo, $152/mo)

**Problem: Hot-path INFO logs**

**Top event:**
- `http_request`: 50M logs/day (every request)

**Root cause:**
```typescript
// ❌ BAD: Log every request
app.use((req, res, next) => {
  logger.info('http_request', {
    method: req.method,
    path: req.path,
    user_id: req.user?.id,
  });
  next();
});

// 50M requests/day × 200 bytes = 120 GB/month
```

**Fix: Sample or use access logs**
```typescript
// ✅ OPTION 1: Sample (10% of requests)
app.use((req, res, next) => {
  if (Math.random() < 0.1) {
    logger.info('http_request', { ... });
  }
  next();
});

// ✅ OPTION 2: Use access logs (cheaper, structured)
// nginx access logs → S3 → Athena (query cost: $5/TB)
// 120 GB/month → $0.60/month query cost (vs $152 in Datadog)
```

**Savings:** $137/month
```

### Category 3: Trace Volume

**Sampling strategy:**
- 100% of errors
- 100% of slow requests (p95+)
- 1-10% of normal requests
- 100% of high-value users (enterprise tier)

**Example: Intelligent sampling**

```typescript
// ✅ Tail-based sampling (sample after completion)
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

class IntelligentSampler extends BatchSpanProcessor {
  shouldSample(span: Span): boolean {
    // Always sample errors
    if (span.status.code === SpanStatusCode.ERROR) {
      return true;
    }

    // Always sample slow requests (>2s)
    const duration = span.endTime - span.startTime;
    if (duration > 2000) {
      return true;
    }

    // Always sample high-value users
    const userTier = span.attributes['user.tier'];
    if (userTier === 'enterprise') {
      return true;
    }

    // Sample 10% of normal requests
    return Math.random() < 0.1;
  }
}

// Cost savings: 90% reduction in trace volume
// Before: 50M traces/day × $0.50/million = $25/day = $750/month
// After: 5M traces/day × $0.50/million = $2.50/day = $75/month
// Savings: $675/month
```

## Step 4: Quality Audit (Wide-Event Compliance)

**Goal:** Ensure logs follow wide-event philosophy.

**Wide-event checklist:**
- [ ] ONE event per request (not scattered logs)
- [ ] Emitted AFTER completion (has outcome)
- [ ] Structured fields (not string concatenation)
- [ ] Business context (user tier, feature flags)
- [ ] Correlation ID (request_id, trace_id)
- [ ] Appropriate log level
- [ ] No PII/secrets

**Anti-patterns:**

```typescript
// ❌ ANTI-PATTERN 1: Scattered logs
logger.info('User login started');
const user = await authenticate(credentials);
logger.info('User authenticated');
const session = await createSession(user);
logger.info('Session created');
logger.info('User login completed');

// Problem: 4 logs to track, can't query "show me failed logins"

// ✅ PATTERN: Wide event
const startTime = Date.now();
try {
  const user = await authenticate(credentials);
  const session = await createSession(user);

  logger.info('user_login', {
    user_id: user.id,
    status: 'success',
    duration_ms: Date.now() - startTime,
    user_tier: user.subscription,
    login_method: credentials.method,
  });
} catch (error) {
  logger.error('user_login', {
    status: 'failed',
    error_type: error.constructor.name,
    duration_ms: Date.now() - startTime,
  });
}

// ❌ ANTI-PATTERN 2: String concatenation
logger.info(`User ${userId} purchased ${itemCount} items for $${total}`);

// Problem: Can't query "show me purchases > $100"

// ✅ PATTERN: Structured fields
logger.info('purchase_completed', {
  user_id: userId,
  item_count: itemCount,
  total_cents: total * 100,
  currency: 'usd',
});

// ❌ ANTI-PATTERN 3: Missing business context
logger.info('api_call', {
  endpoint: '/api/payment',
  duration_ms: 150,
});

// Problem: Can't answer "are premium users slower?"

// ✅ PATTERN: Business context
logger.info('api_call', {
  endpoint: '/api/payment',
  duration_ms: 150,

  // Business context
  user_tier: req.user.subscription,
  feature_flags: req.user.flags,
  cart_value_cents: req.body.amount,

  // Can now query: "p95 latency by user tier"
});
```

**Wide-event audit script:**

```typescript
async function auditWideEventCompliance(service: string): Promise<ComplianceReport> {
  const logs = await fetchLogs(`service:${service}`, '24h');

  const issues = {
    scattered_logs: 0,
    string_concat: 0,
    missing_context: 0,
    missing_correlation: 0,
    wrong_log_level: 0,
  };

  for (const log of logs) {
    // Check for scattered logs (multiple logs with same request_id within 1s)
    if (log.request_id) {
      const relatedLogs = logs.filter(
        l => l.request_id === log.request_id &&
             Math.abs(l.timestamp - log.timestamp) < 1000
      );

      if (relatedLogs.length > 3) {
        issues.scattered_logs++;
      }
    }

    // Check for string concatenation
    if (typeof log.message === 'string' && !log.structured_fields) {
      issues.string_concat++;
    }

    // Check for missing business context
    if (log.event === 'api_call' && !log.user_tier && !log.feature_flags) {
      issues.missing_context++;
    }

    // Check for missing correlation ID
    if (!log.request_id && !log.trace_id) {
      issues.missing_correlation++;
    }

    // Check log level (INFO for business events, ERROR for failures)
    if (log.event.includes('failed') && log.level !== 'ERROR') {
      issues.wrong_log_level++;
    }
  }

  return {
    service,
    total_logs: logs.length,
    issues,
    compliance_score: calculateScore(issues, logs.length),
  };
}
```

## Step 5: Performance Audit (Logging Overhead)

**Goal:** Ensure logging doesn't slow down requests.

**Hot-path logging risks:**
- Blocking I/O (synchronous log writes)
- JSON serialization overhead
- String formatting
- High-cardinality label lookups

**Example: Measure logging overhead**

```typescript
// Benchmark logging impact
import { performance } from 'perf_hooks';

async function benchmarkLogging() {
  const iterations = 10000;

  // Baseline: no logging
  const start1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const result = await processPayment(mockPayment);
  }
  const baseline = performance.now() - start1;

  // With logging
  const start2 = performance.now();
  for (let i = 0; i < iterations; i++) {
    logger.info('payment_processed', { ... });
    const result = await processPayment(mockPayment);
  }
  const withLogging = performance.now() - start2;

  const overhead = ((withLogging - baseline) / baseline * 100);

  console.log(`Baseline: ${baseline.toFixed(2)}ms`);
  console.log(`With logging: ${withLogging.toFixed(2)}ms`);
  console.log(`Overhead: ${overhead.toFixed(2)}%`);

  if (overhead > 10) {
    console.warn('⚠️ Logging adds >10% overhead!');
  }
}
```

**Fix: Async logging**

```typescript
// ❌ BAD: Synchronous logging (blocks request)
logger.info('payment_processed', largeObject);

// ✅ GOOD: Async logging with buffering
logger.infoAsync('payment_processed', largeObject);

// Or use buffered transport
const logger = winston.createLogger({
  transports: [
    new winston.transports.Stream({
      stream: process.stdout,
      // Buffer logs, flush every 100ms
      highWaterMark: 1024,
    }),
  ],
});
```

## Step 6: Generate Telemetry Audit Report

Produce comprehensive report with findings and recommendations.

```markdown
# Telemetry Audit Report

**Audited:** 2024-01-15
**Services:** payment-api, auth-api, frontend-api
**Time range:** Last 30 days

## Executive Summary

**Overall status:** HIGH RISK (3 critical findings, $18k/year waste)

**Critical findings:**
1. Stripe API keys in production logs (500 occurrences)
2. Metric cardinality explosion (1.2M time series, $6k/month)
3. 80% DEBUG logs in production ($2.5k/month wasted)

**Cost savings potential:**
- Current spend: $25,000/year
- After optimization: $7,000/year
- **Savings: $18,000/year (72% reduction)**

## Security Findings (CRITICAL)

### 1. Secrets in Logs [BLOCKER]

**Severity:** CRITICAL
**Risk:** API keys exposed, potential unauthorized charges

**Findings:**
- Stripe API keys: 500 occurrences (payment-api)
- JWT tokens: 1,200 occurrences (auth-api)
- Database passwords: 5 occurrences (analytics-job)

**Remediation (P0, due: 2024-01-16):**
1. Rotate all exposed secrets
2. Fix code: remove secrets from logs
3. Add regex filters in log aggregator
4. Add monitoring: alert on secret patterns

**Owner:** @security-team

### 2. PII in Logs [HIGH]

**Severity:** HIGH
**Risk:** GDPR violations, privacy breach

**Findings:**
- Email addresses: 45k occurrences/day
- Phone numbers: 12k occurrences/day
- IP addresses: 1.2M occurrences/day

**Remediation (P1, due: 2024-01-22):**
1. Hash emails and phones
2. Anonymize IPs (last octet)
3. Update retention policy (30 days)
4. Add PII detection monitoring

**Owner:** @privacy-team

## Cost Findings

### Current Telemetry Spend

| Category | Monthly | Annual |
|----------|---------|--------|
| Logs | $1,200 | $14,400 |
| Metrics | $650 | $7,800 |
| Traces | $250 | $3,000 |
| **Total** | **$2,100** | **$25,200** |

### Optimization Opportunities

**1. Reduce log volume (payment-api)**
- Current: 180 GB/month ($229/mo)
- After: 20 GB/month ($25/mo)
- Savings: $204/month ($2,448/year)
- Fix: Remove DEBUG logs, adopt wide-event pattern

**2. Fix metric cardinality**
- Current: 1.2M time series ($6,000/mo)
- After: 100k time series ($500/mo)
- Savings: $5,500/month ($66,000/year)
- Fix: Remove unbounded labels (user_id, request_id)

**3. Intelligent trace sampling**
- Current: 50M traces/day ($750/mo)
- After: 5M traces/day ($75/mo)
- Savings: $675/month ($8,100/year)
- Fix: Tail-based sampling (100% errors, 10% success)

**Total savings: $18,048/year (72% reduction)**

### Post-Optimization Spend

| Category | Monthly | Annual | Savings |
|----------|---------|--------|---------|
| Logs | $400 | $4,800 | $9,600 |
| Metrics | $150 | $1,800 | $6,000 |
| Traces | $75 | $900 | $2,100 |
| **Total** | **$625** | **$7,500** | **$17,700** |

## Quality Findings

### Wide-Event Compliance Score: 45/100 (POOR)

**Issues:**
- 65% of logs are scattered (not wide events)
- 40% missing business context
- 30% using string concatenation
- 20% missing correlation IDs

**Recommendation:** Adopt wide-event pattern across all services

**Example refactor:**
```diff
- logger.info('Payment started');
- const result = await process();
- logger.info('Payment completed');
+ logger.info('payment_processed', {
+   user_id, amount_cents, status,
+   duration_ms, user_tier, // business context
+ });
```

## Action Items

### P0: Critical (must fix immediately)

| # | Item | Owner | Effort | Due | Savings |
|---|------|-------|--------|-----|---------|
| 1 | Rotate exposed secrets | @security | 2h | Jan 16 | - |
| 2 | Remove secrets from logs | @backend | 1d | Jan 17 | - |
| 3 | Fix metric cardinality | @sre | 2d | Jan 19 | $5.5k/mo |

### P1: High (fix this sprint)

| # | Item | Owner | Effort | Due | Savings |
|---|------|-------|--------|-----|---------|
| 4 | Remove DEBUG logs in prod | @backend | 3d | Jan 24 | $200/mo |
| 5 | Adopt wide-event pattern | @backend | 1w | Jan 31 | - |
| 6 | Hash PII in logs | @backend | 2d | Jan 26 | - |
| 7 | Implement trace sampling | @sre | 3d | Jan 29 | $675/mo |

### P2: Medium (next sprint)

- Update log retention policy (30 days)
- Add PII/secret detection monitoring
- Create telemetry runbook
- Quarterly telemetry audit process

## Monitoring & Prevention

**Prevent regression:**
1. Add pre-commit hook: detect secrets in code
2. Add CI check: detect PII patterns
3. Add budget alert: telemetry spend > $2k/month
4. Quarterly audit: review top 10 metrics/logs

**Metrics to track:**
- `telemetry.cost_monthly` (budget: $625)
- `telemetry.secrets_detected` (target: 0)
- `telemetry.pii_detected` (target: 0)
- `metric.cardinality` (target: <100k)

## Appendix: Detailed Findings

[Include detailed logs, metrics, traces analysis...]
```

## Telemetry Audit Philosophy

**Good telemetry is:**
- ✅ **Safe**: No secrets or PII
- ✅ **Cost-effective**: Sample intelligently, bound cardinality
- ✅ **High-quality**: Wide events, structured fields, business context
- ✅ **Compliant**: GDPR, data retention, encryption
- ✅ **Performant**: Async logging, minimal overhead

**Bad telemetry is:**
- ❌ **Dangerous**: Secrets in logs, PII exposure
- ❌ **Expensive**: DEBUG in prod, unbounded cardinality
- ❌ **Noisy**: Scattered logs, hot-path logging
- ❌ **Non-compliant**: No retention policy, no encryption
- ❌ **Slow**: Synchronous I/O, excessive serialization

**The goal:** Safe, cost-effective observability that helps you debug at 2am.
