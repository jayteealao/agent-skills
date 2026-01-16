---
description: "Convert RCA findings into trackable action items with owners, priorities, and completion criteria"
color: "red"
---

# /postmortem-actions

**Purpose**: Transform root cause analysis findings into a prioritized, trackable action plan with clear ownership and "done when" criteria.

**When to use**:
- After completing `/rca` for a production incident
- When converting incident learnings into preventive measures
- Before closing a postmortem to ensure follow-through
- To create cross-functional accountability for reliability improvements

**INPUTS**:
```
/postmortem-actions
RCA: <paste /rca output or link to postmortem>
SCOPE: <service|team|org>
PRIORITIZATION: <impact-first|effort-first|balanced>
CAPACITY: <low|medium|high>
OWNERSHIP_MODEL: <direct-owner|module-owners|team-rotation>
TRACKING_SYSTEM: <jira|linear|github|none>
DUE_DATE_POLICY: <aggressive|realistic|none>
```

**Parameter guide**:

- **RCA**: The root cause analysis document (paste inline or provide link)
- **SCOPE**:
  - `service`: Actions scoped to single service
  - `team`: Actions across team's services
  - `org`: Cross-team coordination needed
- **PRIORITIZATION**:
  - `impact-first`: Prioritize by blast radius reduction
  - `effort-first`: Quick wins first (momentum building)
  - `balanced`: Impact × Effort matrix (default)
- **CAPACITY**:
  - `low`: 20% eng time available (2-3 P0 actions max)
  - `medium`: 40% eng time (5-7 P0+P1 actions)
  - `high`: Dedicated sprint (10+ actions)
- **OWNERSHIP_MODEL**:
  - `direct-owner`: Assign to person who worked on original code
  - `module-owners`: Assign by system/module ownership
  - `team-rotation`: Distribute across oncall rotation
- **TRACKING_SYSTEM**: Where to create tickets (jira/linear/github/none)
- **DUE_DATE_POLICY**:
  - `aggressive`: P0 in 1 week, P1 in 2 weeks, P2 in 1 month
  - `realistic`: P0 in 2 weeks, P1 in 1 month, P2 in 1 quarter
  - `none`: No due dates (rely on priority only)

---

## ACTION CATEGORIES

Use all categories that apply to the incident:

### 1. Prevention
Code, design, or architectural guardrails to prevent recurrence:
- Input validation, type safety, schema enforcement
- Resource limits, rate limiting, backpressure
- Configuration validation, deployment gates
- Dependency version pinning, lock files

### 2. Detection
Observability improvements to catch issues earlier:
- Alerts on error rates, latency, resource usage
- Dashboards for business and technical metrics
- Logging/tracing for dark corners
- Synthetic monitoring, canary health checks

### 3. Response
Runbooks, automation, and tooling for faster mitigation:
- Incident runbooks with commands
- Automated rollback procedures
- Self-healing mechanisms (circuit breakers, retries)
- Emergency access procedures

### 4. Process
Development and operational process improvements:
- Code review checklists
- CI/CD checks (linting, testing, security scans)
- Staging environment discipline
- Change management procedures

### 5. Reliability Hardening
System design improvements for resilience:
- Timeouts, retries with exponential backoff
- Circuit breakers, bulkheads
- Graceful degradation, fallback mechanisms
- Chaos engineering tests

### 6. Security/Privacy Hardening
If security or privacy was involved:
- Authentication/authorization fixes
- Secret management improvements
- PII handling, data retention policies
- Audit logging for sensitive operations

---

## WORKFLOW

### Step 1: Extract Failure Modes from RCA

**Task**: Identify all contributing factors from the RCA.

**Checklist**:
- [ ] Read through RCA "5 Whys" section
- [ ] Note primary root cause
- [ ] List secondary contributing factors
- [ ] Identify near-miss indicators (warning signs missed)
- [ ] Document blast radius (users affected, duration, business impact)

**Output**: List of failure modes with context.

---

### Step 2: Generate Prevention Actions

**Task**: For each failure mode, create actions to prevent recurrence.

**Checklist**:
- [ ] For code defects → linting rules, type checks, validation
- [ ] For configuration errors → schema validation, deployment checks
- [ ] For missing limits → rate limits, resource quotas, backpressure
- [ ] For dependency issues → version pinning, dependency audit
- [ ] For design flaws → architectural changes, refactoring

**Pattern**: "Prevent X by doing Y"

**Examples**:
- "Prevent invalid email format by adding Zod schema validation"
- "Prevent unbounded queue growth by adding max queue size limit"
- "Prevent dependency drift by enabling Renovate auto-updates"

---

### Step 3: Generate Detection Actions

**Task**: Create observability to catch similar issues faster.

**Checklist**:
- [ ] For errors → alert on error rate > threshold
- [ ] For latency → alert on p95 > threshold
- [ ] For resource exhaustion → alert on CPU/memory/disk > 80%
- [ ] For business impact → dashboard with key metrics (orders, signups, revenue)
- [ ] For blind spots → add logging/tracing to uncovered code paths

**Pattern**: "Detect X by monitoring Y with alert Z"

**Examples**:
- "Detect payment failures by alerting on Stripe error rate > 1% for 5 min"
- "Detect slow queries by alerting on p95 query latency > 1s"
- "Detect queue backlog by alerting on queue depth > 10,000"

---

### Step 4: Generate Response Actions

**Task**: Make mitigation faster and easier.

**Checklist**:
- [ ] For manual mitigation → create runbook with commands
- [ ] For rollback needs → document rollback procedure
- [ ] For repeated incidents → automate mitigation (circuit breaker, auto-scale)
- [ ] For access issues → document emergency access procedure
- [ ] For communication needs → create incident response template

**Pattern**: "Enable faster mitigation by doing X"

**Examples**:
- "Create runbook for clearing Redis cache with verification steps"
- "Document 1-command rollback procedure in deployment README"
- "Add circuit breaker to payment API with 5-error threshold"

---

### Step 5: Generate Process Actions

**Task**: Add development/operational guardrails.

**Checklist**:
- [ ] For review gaps → add checklist items to PR template
- [ ] For testing gaps → add CI checks (unit, integration, e2e)
- [ ] For deployment risks → require staging validation before prod
- [ ] For change risks → require change management approval for high-risk changes
- [ ] For knowledge gaps → add documentation, training sessions

**Pattern**: "Require X before Y"

**Examples**:
- "Add migration review checklist requiring query performance analysis"
- "Require staging smoke tests to pass before prod deployment"
- "Add ESLint rule forbidding process.exit() in web handlers"

---

### Step 6: Generate Reliability Actions

**Task**: Improve system resilience to failures.

**Checklist**:
- [ ] For timeout-related → add timeouts with sensible defaults
- [ ] For transient failures → add retries with exponential backoff
- [ ] For cascading failures → add circuit breakers, bulkheads
- [ ] For dependency failures → add fallback mechanisms, graceful degradation
- [ ] For untested failure modes → add chaos engineering tests

**Pattern**: "Harden X by adding Y"

**Examples**:
- "Add 30s timeout to Stripe API calls with retry on 5xx"
- "Add circuit breaker to email service with 10-error threshold"
- "Add chaos test: kill database mid-request, verify graceful error"

---

### Step 7: Generate Security/Privacy Actions (if applicable)

**Task**: Address security or privacy gaps exposed by incident.

**Checklist**:
- [ ] For auth issues → strengthen authentication, add MFA
- [ ] For authz issues → add permission checks, principle of least privilege
- [ ] For secret exposure → rotate secrets, improve secret management
- [ ] For PII exposure → add PII redaction, audit logging
- [ ] For compliance → document data retention, add GDPR compliance checks

**Pattern**: "Secure X by doing Y"

**Examples**:
- "Rotate Stripe API keys and move to AWS Secrets Manager"
- "Add PII redaction for email addresses in Datadog logs"
- "Require MFA for production database access"

---

### Step 8: Prioritize Actions

**Task**: Rank actions by priority using impact × effort matrix.

**Priority definitions**:
- **P0 (CRITICAL)**: High impact, must fix immediately (blocker for similar incidents)
- **P1 (HIGH)**: High impact, significant effort, or medium impact, low effort
- **P2 (MEDIUM)**: Medium impact, medium effort, or low impact, low effort
- **P3 (LOW)**: Low impact, high effort (nice-to-have)

**Effort scale**:
- **S (Small)**: < 1 day, single person, no coordination
- **M (Medium)**: 1-5 days, single person or small team
- **L (Large)**: > 5 days, team effort, coordination needed

**Prioritization strategies**:

#### Impact-First
1. Sort by blast radius (users affected × duration)
2. Prioritize P0 = prevents same incident
3. P1 = prevents similar incidents
4. P2 = improves reliability generally

#### Effort-First
1. Sort by effort (S → M → L)
2. Deliver quick wins for momentum
3. Build confidence before tackling large refactors

#### Balanced (recommended)
1. Create impact × effort matrix
2. P0 = high impact, any effort
3. P1 = (high impact, M/L effort) OR (medium impact, S/M effort)
4. P2 = (medium impact, L effort) OR (low impact, S effort)
5. P3 = low impact, M/L effort

**Capacity-based filtering**:
- **Low capacity**: Only P0 actions (2-3 max)
- **Medium capacity**: P0 + critical P1 actions (5-7 total)
- **High capacity**: P0 + P1 + selected P2 actions (10+ total)

**Checklist**:
- [ ] Assign category to each action
- [ ] Estimate impact (high/med/low)
- [ ] Estimate effort (S/M/L)
- [ ] Calculate priority (P0/P1/P2/P3)
- [ ] Filter by capacity
- [ ] Sequence dependencies (must do X before Y)

---

### Step 9: Assign Ownership

**Task**: Assign each action to a specific owner.

**Ownership models**:

#### Direct Owner
- Owner = person who wrote original code or maintains the system
- **Pros**: Domain knowledge, accountability
- **Cons**: Can overload individuals, creates bottlenecks

#### Module Owners
- Owner = designated owner of affected module/service
- **Pros**: Aligns with architecture, clear ownership
- **Cons**: May not align with team capacity

#### Team Rotation
- Owner = next person in oncall rotation or evenly distributed
- **Pros**: Spreads load, builds shared knowledge
- **Cons**: Less domain expertise, may slow execution

**Checklist**:
- [ ] For each P0/P1 action, assign specific owner (name, not team)
- [ ] Verify owner has capacity for due date
- [ ] For cross-team actions, assign coordinator + collaborators
- [ ] For org-wide actions, assign executive sponsor
- [ ] Document backup owner for high-priority items

---

### Step 10: Create Tracking Tickets and Timeline

**Task**: Create tickets in tracking system with clear "done when" criteria.

**"Done When" criteria** (must be measurable):
- **Code changes**: "PR merged with tests passing"
- **Alerts**: "Alert firing in staging for simulated failure"
- **Runbooks**: "Runbook tested by 2 engineers, documented in wiki"
- **Process changes**: "Checklist added to PR template, used in 3 PRs"
- **Architecture changes**: "Deployed to prod, monitored for 1 week, no regressions"

**Due date policies**:

#### Aggressive
- P0: 1 week from incident
- P1: 2 weeks from incident
- P2: 1 month from incident

#### Realistic (recommended)
- P0: 2 weeks from incident
- P1: 1 month from incident
- P2: 1 quarter from incident

#### None
- No hard deadlines, rely on priority and team velocity

**Checklist**:
- [ ] For each action, write clear "done when" criteria
- [ ] Assign due dates based on priority and policy
- [ ] Create tickets in tracking system (if not "none")
- [ ] Link tickets to original postmortem/RCA
- [ ] Schedule follow-up review meeting (2 weeks out for P0, 1 month for P1)
- [ ] Add actions to team roadmap/sprint planning

---

## OUTPUT TEMPLATE

```markdown
# Postmortem Action Plan
**Incident**: [incident title]
**Date**: [incident date]
**RCA**: [link to RCA document]
**Scope**: [service|team|org]
**Capacity**: [low|medium|high]

---

## 0) Summary

**Incident theme** (1 sentence):
[e.g., "Database query timeout due to missing index on high-traffic JOIN"]

**Primary failure mode**:
[e.g., "Missing index on users.email caused 30s query timeout on orders endpoint"]

**Top prevention leverage point**:
[e.g., "Add migration review checklist requiring query performance analysis with EXPLAIN"]

**Blast radius**:
- **Users affected**: [number or percentage]
- **Duration**: [minutes/hours]
- **Business impact**: [revenue lost, SLA breach, customer complaints]

**Action summary**:
- **Total actions**: [number]
- **P0 (Critical)**: [number] actions
- **P1 (High)**: [number] actions
- **P2 (Medium)**: [number] actions

---

## 1) Action Items (Prioritized Table)

| ID | Category | Action | Priority | Effort | Owner | Done When | Due |
|----|----------|--------|----------|--------|-------|-----------|-----|
| A1 | Prevention | Add index on users.email | P0 | S | @alice | Index created, query < 100ms | 2025-01-22 |
| A2 | Detection | Alert on p95 query latency > 1s | P0 | S | @bob | Alert firing in staging | 2025-01-22 |
| A3 | Process | Add migration review checklist | P0 | M | @charlie | Checklist in PR template, used 3x | 2025-01-29 |
| A4 | Response | Create DB performance runbook | P1 | M | @alice | Runbook tested by 2 engineers | 2025-02-05 |
| A5 | Reliability | Add 10s timeout to orders query | P1 | S | @bob | Deployed to prod, no timeouts | 2025-02-05 |
| A6 | Detection | Add slow query dashboard | P2 | M | @charlie | Dashboard live, used in standup | 2025-03-01 |

---

## 2) Immediate Actions (P0)

### A1: Add index on users.email
**Category**: Prevention
**Owner**: @alice
**Effort**: S (< 1 day)
**Due**: 2025-01-22

**Rationale**: Missing index caused 30s query timeout on orders endpoint. This is the direct root cause.

**Action**:
```sql
-- migration: 20250115_add_users_email_index.sql
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
```

**Done when**: Index created in production, query time < 100ms (verified with EXPLAIN ANALYZE)

**Verification**:
```sql
-- Before: Seq Scan on users (cost=0.00..1234.56 rows=50000)
-- After: Index Scan using idx_users_email on users (cost=0.42..8.44 rows=1)
EXPLAIN ANALYZE
SELECT o.* FROM orders o
JOIN users u ON o.user_id = u.id
WHERE u.email = 'test@example.com';
```

**Tracking**: [JIRA-1234]

---

### A2: Alert on p95 query latency > 1s
**Category**: Detection
**Owner**: @bob
**Effort**: S (< 1 day)
**Due**: 2025-01-22

**Rationale**: We had no alert on slow queries. This incident went undetected for 45 minutes until customer complaints.

**Action**:
```yaml
# datadog/monitors/postgres-slow-queries.yaml
name: "Postgres p95 query latency high"
type: metric alert
query: "avg(last_5m):p95:postgres.query.duration{service:orders-api} > 1000"
message: |
  Postgres queries are slow (p95 > 1s).

  Runbook: https://wiki.example.com/runbooks/postgres-slow-queries

  @pagerduty-oncall @slack-eng-alerts
thresholds:
  critical: 1000
  warning: 500
```

**Done when**: Alert created in Datadog, tested by running slow query in staging, alert fired within 5 minutes

**Tracking**: [JIRA-1235]

---

### A3: Add migration review checklist
**Category**: Process
**Owner**: @charlie
**Effort**: M (2-3 days)
**Due**: 2025-01-29

**Rationale**: Migration PR didn't include query performance analysis. This is the process root cause.

**Action**:
1. Create migration review checklist
2. Add to PR template
3. Document in engineering wiki
4. Present in team meeting

**Checklist content**:
```markdown
## Database Migration Checklist

- [ ] **Query performance analysis**
  - [ ] Run EXPLAIN ANALYZE on affected queries
  - [ ] Verify query time < 100ms (or document why longer is acceptable)
  - [ ] Add indexes for JOIN columns and WHERE clauses

- [ ] **Index strategy**
  - [ ] Use CREATE INDEX CONCURRENTLY (no downtime)
  - [ ] Verify index is used (check EXPLAIN output)
  - [ ] Consider composite indexes for multi-column queries

- [ ] **Rollback plan**
  - [ ] Document how to drop index/revert migration
  - [ ] Test rollback in staging

- [ ] **Monitoring**
  - [ ] Add query duration metrics
  - [ ] Monitor for 24h after deployment
```

**Done when**:
- Checklist added to `.github/pull_request_template.md`
- Checklist used and verified in 3 migration PRs
- 100% of team trained (present in team meeting)

**Tracking**: [JIRA-1236]

---

## 3) Short-Term Actions (P1)

### A4: Create DB performance runbook
**Category**: Response
**Owner**: @alice
**Effort**: M (3-4 days)
**Due**: 2025-02-05

**Rationale**: Oncall engineer didn't know how to diagnose slow queries quickly. A runbook would have reduced MTTR from 45min to 10min.

**Action**: Create comprehensive runbook at `docs/runbooks/postgres-slow-queries.md`

**Runbook outline**:
```markdown
# Runbook: Postgres Slow Queries

## Symptoms
- Alert: "Postgres p95 query latency high"
- User reports: slow page loads, timeouts
- Datadog: p95 query duration > 1s

## Diagnosis (5 minutes)

### Step 1: Identify slow queries
```sql
-- Connect to DB replica (read-only)
psql $DATABASE_URL_REPLICA

-- Find slow queries in last 5 minutes
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 1000
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Step 2: Check query plan
```sql
EXPLAIN ANALYZE [slow query here];
```

### Step 3: Look for missing indexes
- Seq Scan = missing index (bad)
- Index Scan = index present (good)

## Mitigation (5 minutes)

### Option 1: Add index (safe, no downtime)
```sql
CREATE INDEX CONCURRENTLY idx_name ON table(column);
```

### Option 2: Kill slow queries (temporary fix)
```sql
SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '30 seconds';
```

### Option 3: Scale up DB (if emergency)
```bash
aws rds modify-db-instance --db-instance-id prod-postgres \
  --db-instance-class db.r5.2xlarge --apply-immediately
```

## Verification
- Query time < 100ms (run EXPLAIN ANALYZE again)
- Alert resolved
- User reports resolved

## Follow-up
- Create migration PR with index
- Update query patterns to use index
- Add test to CI preventing missing indexes
```

**Done when**:
- Runbook written and reviewed by 2 engineers
- Runbook tested in staging (simulate slow query, follow runbook, verify fix)
- Runbook linked from alert

**Tracking**: [JIRA-1237]

---

### A5: Add 10s timeout to orders query
**Category**: Reliability
**Owner**: @bob
**Effort**: S (1 day)
**Due**: 2025-02-05

**Rationale**: Query timed out after default 30s, causing 30s of user-facing latency. A 10s timeout would have failed faster, allowing retry or fallback.

**Action**:
```typescript
// src/services/orders.ts

// ❌ BEFORE: No timeout (defaults to 30s)
const orders = await db.query(`
  SELECT o.* FROM orders o
  JOIN users u ON o.user_id = u.id
  WHERE u.email = $1
`, [email]);

// ✅ AFTER: 10s timeout with error handling
const orders = await db.query({
  text: `
    SELECT o.* FROM orders o
    JOIN users u ON o.user_id = u.id
    WHERE u.email = $1
  `,
  values: [email],
  statement_timeout: 10000  // 10s timeout
}).catch(err => {
  if (err.code === '57014') {  // query_canceled
    logger.error('Orders query timeout', { email, duration_ms: 10000 });
    throw new ServiceError('Orders query timeout', { retriable: true });
  }
  throw err;
});
```

**Done when**:
- Code deployed to production
- Monitored for 7 days with no timeout errors (once index is added)
- Chaos test added: simulate slow query, verify 10s timeout

**Tracking**: [JIRA-1238]

---

## 4) Longer-Term Actions (P2)

### A6: Add slow query dashboard
**Category**: Detection
**Owner**: @charlie
**Effort**: M (3-4 days)
**Due**: 2025-03-01

**Rationale**: We have metrics but no dashboard. A dashboard would make slow queries visible before they cause incidents.

**Action**: Create Datadog dashboard with:

**Widgets**:
1. **p50/p95/p99 query duration** (timeseries, 24h)
2. **Slow query count** (query > 1s, count per minute)
3. **Top 10 slowest queries** (table, sorted by p95)
4. **Query duration by endpoint** (heatmap)
5. **Index hit rate** (should be > 99%)
6. **Connection pool utilization** (should be < 80%)

**Dashboard JSON**:
```json
{
  "title": "Postgres Performance",
  "widgets": [
    {
      "definition": {
        "title": "Query Duration (p50/p95/p99)",
        "type": "timeseries",
        "requests": [
          {
            "q": "avg:postgres.query.duration{service:orders-api} by {percentile}",
            "display_type": "line"
          }
        ]
      }
    },
    {
      "definition": {
        "title": "Slow Queries (> 1s)",
        "type": "query_value",
        "requests": [
          {
            "q": "sum:postgres.query.duration{service:orders-api,duration:>1000}.as_count()",
            "aggregator": "sum"
          }
        ]
      }
    }
  ]
}
```

**Done when**:
- Dashboard created in Datadog
- Dashboard URL added to team wiki
- Dashboard reviewed in standup for 1 week
- Team can identify slow queries without querying DB directly

**Tracking**: [JIRA-1239]

---

## 5) Detection Coverage Map

**Before incident**:
| Signal | Coverage | Alert | Dashboard |
|--------|----------|-------|-----------|
| Query duration | ❌ No | ❌ No | ❌ No |
| Slow queries | ❌ No | ❌ No | ❌ No |
| Missing indexes | ❌ No | ❌ No | ❌ No |
| Error rate | ✅ Yes | ✅ Yes | ✅ Yes |
| User complaints | ✅ Yes (manual) | ❌ No | ❌ No |

**After P0 actions** (1 week):
| Signal | Coverage | Alert | Dashboard |
|--------|----------|-------|-----------|
| Query duration | ✅ Yes | ✅ Yes (p95 > 1s) | ❌ No |
| Slow queries | ✅ Yes | ✅ Yes | ❌ No |
| Missing indexes | ⚠️ Partial (review checklist) | ❌ No | ❌ No |
| Error rate | ✅ Yes | ✅ Yes | ✅ Yes |
| User complaints | ✅ Yes | ❌ No | ❌ No |

**After P1 actions** (1 month):
| Signal | Coverage | Alert | Dashboard |
|--------|----------|-------|-----------|
| Query duration | ✅ Yes | ✅ Yes | ✅ Yes (runbook linked) |
| Slow queries | ✅ Yes | ✅ Yes | ✅ Yes |
| Missing indexes | ✅ Yes (CI check) | ❌ No | ❌ No |
| Error rate | ✅ Yes | ✅ Yes | ✅ Yes |
| User complaints | ✅ Yes | ⚠️ Partial (faster MTTR) | ✅ Yes |

**After P2 actions** (1 quarter):
| Signal | Coverage | Alert | Dashboard |
|--------|----------|-------|-----------|
| Query duration | ✅ Yes | ✅ Yes | ✅ Yes |
| Slow queries | ✅ Yes | ✅ Yes | ✅ Yes |
| Missing indexes | ✅ Yes | ✅ Yes (CI check) | ✅ Yes |
| Error rate | ✅ Yes | ✅ Yes | ✅ Yes |
| User complaints | ✅ Yes | ✅ Yes (proactive detection) | ✅ Yes |

**Detection improvement**: From 40% coverage (2/5 signals) to 100% coverage (5/5 signals)

---

## 6) Validation Plan

**Objective**: Verify that completed actions actually prevent recurrence.

### Validation: A1 (Add index)
**Method**: Load test
```bash
# Generate 10,000 orders with random emails
artillery run tests/load/orders-by-email.yml

# Verify p95 < 100ms
echo "SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FROM query_log WHERE query_name = 'orders_by_email';" | psql $DATABASE_URL
```

**Success criteria**: p95 query duration < 100ms under load

---

### Validation: A2 (Alert on slow queries)
**Method**: Chaos test
```bash
# Run intentionally slow query in staging
psql $DATABASE_URL_STAGING -c "SELECT pg_sleep(2);"

# Verify alert fires within 5 minutes
curl https://api.datadoghq.com/api/v1/monitor/12345/status
```

**Success criteria**: Alert fires within 5 minutes, oncall receives page

---

### Validation: A3 (Migration review checklist)
**Method**: Process audit
- Review 10 migration PRs after checklist deployed
- Verify 100% include query performance analysis
- Verify 0 regressions in query duration

**Success criteria**: 100% compliance, 0 slow query incidents from migrations

---

### Validation: A4 (Runbook)
**Method**: Simulated incident
- Oncall engineer follows runbook (without prior knowledge)
- Measure time to diagnose + mitigate
- Target: < 15 minutes (down from 45 minutes)

**Success criteria**: MTTR < 15 minutes in simulation

---

### Validation: A5 (Timeout)
**Method**: Chaos test
```typescript
// tests/chaos/slow-query.test.ts
it('should timeout slow queries after 10s', async () => {
  // Simulate slow query (e.g., pg_sleep)
  const start = Date.now();
  await expect(
    db.query('SELECT pg_sleep(20)')
  ).rejects.toThrow('query_canceled');

  const duration = Date.now() - start;
  expect(duration).toBeLessThan(11000);  // 10s + 1s margin
});
```

**Success criteria**: Query times out after 10s (not 30s)

---

### Validation: Full system (all actions)
**Method**: Reproduce incident
1. Remove index from staging
2. Generate load (10,000 requests)
3. Verify:
   - Alert fires within 5 minutes ✅
   - Oncall follows runbook ✅
   - Runbook resolves issue in < 15 minutes ✅
   - Query timeout prevents 30s user-facing latency ✅

**Success criteria**: Same incident detected and mitigated 3x faster (15min vs 45min MTTR)

---

## 7) Tracking Notes

**Tracking system**: JIRA
**Epic**: [JIRA-1233] "2025-01-15 Orders API Timeout - Postmortem Actions"

**Tickets created**:
- [JIRA-1234] A1: Add index on users.email (P0, @alice, Due: 2025-01-22)
- [JIRA-1235] A2: Alert on p95 query latency > 1s (P0, @bob, Due: 2025-01-22)
- [JIRA-1236] A3: Add migration review checklist (P0, @charlie, Due: 2025-01-29)
- [JIRA-1237] A4: Create DB performance runbook (P1, @alice, Due: 2025-02-05)
- [JIRA-1238] A5: Add 10s timeout to orders query (P1, @bob, Due: 2025-02-05)
- [JIRA-1239] A6: Add slow query dashboard (P2, @charlie, Due: 2025-03-01)

**Follow-up meetings**:
- **2025-01-22** (1 week): Review P0 action completion (A1, A2, A3)
- **2025-02-05** (3 weeks): Review P1 action completion (A4, A5)
- **2025-03-01** (6 weeks): Review P2 action completion (A6)
- **2025-04-15** (3 months): Retrospective on action effectiveness

**Rollup reporting** (for leadership):
```markdown
## Incident Follow-Up Summary

**Incident**: Orders API timeout (2025-01-15)
**Impact**: 50% of checkout requests timing out for 45 minutes
**Root cause**: Missing database index on users.email

**Actions taken**:
- 3 P0 actions (prevent recurrence, detect faster, improve process)
- 2 P1 actions (faster mitigation, reliability hardening)
- 1 P2 action (better visibility)

**Timeline**:
- Week 1: P0 actions complete (index added, alert created, checklist deployed)
- Week 3: P1 actions complete (runbook created, timeout added)
- Month 3: P2 actions complete (dashboard deployed)

**Validation**:
- Load test: p95 query duration < 100ms ✅
- Chaos test: alert fires within 5 minutes ✅
- Process audit: 100% migration PR compliance ✅
- Simulated incident: MTTR reduced from 45min → 15min ✅

**Outcome**: Similar incidents will be detected 6x faster and mitigated 3x faster.
```

---

**End of action plan**
```

---

## EXAMPLE OUTPUT 1: Payment API Timeout

**Scenario**: Payment API calls to Stripe timing out after 60s, causing checkout failures.

**RCA summary**:
- Stripe API calls had no timeout configured
- Stripe experienced 2-minute slowdown during incident
- Our API waited 60s (default HTTP timeout) before failing
- No circuit breaker, so every request hit Stripe even while degraded

**Capacity**: Medium (5-7 actions)
**Prioritization**: Impact-first

```markdown
# Postmortem Action Plan
**Incident**: Payment API Timeout
**Date**: 2025-01-10
**Scope**: service (payment-api)
**Capacity**: medium

---

## 0) Summary

**Incident theme**: External dependency timeout with no fallback mechanism

**Primary failure mode**: Stripe API calls had no timeout, waited 60s per request during Stripe degradation

**Top prevention leverage point**: Add 10s timeout to all external API calls with circuit breaker

**Blast radius**:
- Users affected: 2,500 (20% of checkouts during 30min incident)
- Duration: 30 minutes
- Business impact: $45,000 in lost GMV

**Action summary**:
- Total actions: 7
- P0: 3 actions (timeout, circuit breaker, alert)
- P1: 3 actions (runbook, retry logic, fallback)
- P2: 1 action (chaos test)

---

## 1) Action Items (Prioritized Table)

| ID | Category | Action | Priority | Effort | Owner | Done When | Due |
|----|----------|--------|----------|--------|-------|-----------|-----|
| A1 | Reliability | Add 10s timeout to Stripe API | P0 | S | @alice | Deployed, no 60s waits | 2025-01-17 |
| A2 | Reliability | Add circuit breaker to Stripe | P0 | M | @bob | CB opens on 5 errors | 2025-01-24 |
| A3 | Detection | Alert on payment error rate > 5% | P0 | S | @charlie | Alert fires in staging | 2025-01-17 |
| A4 | Response | Create payment failure runbook | P1 | M | @alice | Tested by oncall | 2025-01-31 |
| A5 | Reliability | Add exponential backoff retry | P1 | S | @bob | 3 retries with backoff | 2025-01-31 |
| A6 | Reliability | Add fallback to queue payment | P1 | L | @charlie | Async payment flow works | 2025-02-14 |
| A7 | Reliability | Add chaos test for Stripe timeout | P2 | M | @alice | Test passes in CI | 2025-03-10 |

---

## 2) Immediate Actions (P0)

### A1: Add 10s timeout to Stripe API calls
**Category**: Reliability
**Owner**: @alice
**Due**: 2025-01-17

```typescript
// src/services/stripe.ts

// ❌ BEFORE: No timeout (waits 60s default)
const charge = await stripe.charges.create({
  amount: 2000,
  currency: 'usd',
  source: token
});

// ✅ AFTER: 10s timeout
const charge = await Promise.race([
  stripe.charges.create({
    amount: 2000,
    currency: 'usd',
    source: token
  }),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Stripe timeout')), 10000)
  )
]);
```

**Done when**: Deployed to prod, monitored for 3 days, no 60s waits

---

### A2: Add circuit breaker to Stripe API
**Category**: Reliability
**Owner**: @bob
**Due**: 2025-01-24

```typescript
import CircuitBreaker from 'opossum';

const breakerOptions = {
  timeout: 10000,          // 10s timeout
  errorThresholdPercentage: 50,  // Open after 50% errors
  resetTimeout: 30000      // Try again after 30s
};

const breaker = new CircuitBreaker(stripeClient.charges.create, breakerOptions);

breaker.fallback(() => {
  return { status: 'queued', message: 'Payment queued for retry' };
});

breaker.on('open', () => {
  logger.error('Stripe circuit breaker opened');
  // Alert oncall
});
```

**Done when**: CB deployed, opens after 5 errors, fallback works

---

### A3: Alert on payment error rate > 5%
**Category**: Detection
**Owner**: @charlie
**Due**: 2025-01-17

```yaml
name: "Payment error rate high"
query: "sum(last_5m):sum:payment.error.count / sum:payment.total.count > 0.05"
message: "@pagerduty-oncall Payment error rate > 5%. Runbook: /runbooks/payment-failures"
```

**Done when**: Alert created, tested in staging, fires within 5 min

---

## 3) Short-Term Actions (P1)

### A4: Create payment failure runbook
**Owner**: @alice
**Due**: 2025-01-31

**Runbook content**:
```markdown
# Runbook: Payment Failures

## Diagnosis
1. Check Stripe status: https://status.stripe.com
2. Check circuit breaker state: `curl https://api.example.com/health`
3. Check error rate: Datadog dashboard

## Mitigation
- If Stripe degraded: Circuit breaker should open automatically
- If circuit breaker stuck closed: `curl -X POST https://api.example.com/admin/circuit-breaker/stripe/open`
- Verify fallback working: Check `payment_queue` table for queued payments
```

**Done when**: Runbook tested by 2 oncall engineers

---

### A5: Add exponential backoff retry
**Owner**: @bob
**Due**: 2025-01-31

```typescript
async function chargeWithRetry(params: ChargeParams, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await breaker.fire(params);
    } catch (err) {
      if (!err.retriable || i === maxRetries - 1) throw err;
      const delay = Math.min(1000 * Math.pow(2, i), 10000);  // 1s, 2s, 4s
      await sleep(delay);
    }
  }
}
```

**Done when**: Deployed, chaos test shows 3 retries with backoff

---

### A6: Add fallback to queue payment for async processing
**Owner**: @charlie
**Due**: 2025-02-14

```typescript
async function processPayment(params: ChargeParams) {
  try {
    return await chargeWithRetry(params);
  } catch (err) {
    // Fallback: Queue for async processing
    await db.insert('payment_queue', {
      user_id: params.user_id,
      amount: params.amount,
      status: 'queued',
      retry_after: new Date(Date.now() + 60000)  // Retry in 1 min
    });

    return {
      status: 'queued',
      message: 'Payment queued. You will receive email confirmation.'
    };
  }
}
```

**Done when**: Async payment flow works end-to-end in staging

---

## 4) Longer-Term Actions (P2)

### A7: Add chaos test for Stripe timeout
**Owner**: @alice
**Due**: 2025-03-10

```typescript
// tests/chaos/stripe-timeout.test.ts
it('should handle Stripe timeout gracefully', async () => {
  // Simulate Stripe taking 30s to respond
  nock('https://api.stripe.com')
    .post('/v1/charges')
    .delay(30000)
    .reply(200, { id: 'ch_test' });

  const start = Date.now();
  const result = await processPayment({ amount: 2000, token: 'tok_test' });
  const duration = Date.now() - start;

  // Should timeout after 10s and use fallback
  expect(duration).toBeLessThan(11000);
  expect(result.status).toBe('queued');
});
```

**Done when**: Chaos test passes in CI, runs nightly

---

## 5) Detection Coverage Map

| Signal | Before | After P0 | After P1 | After P2 |
|--------|--------|----------|----------|----------|
| Payment error rate | ❌ | ✅ Alert | ✅ Alert | ✅ Alert |
| Stripe latency | ❌ | ❌ | ✅ Dashboard | ✅ Alert |
| Circuit breaker state | ❌ | ✅ Logs | ✅ Dashboard | ✅ Alert |
| Queued payments | ❌ | ❌ | ✅ Dashboard | ✅ Alert |

---

## 6) Validation Plan

**Chaos test**: Simulate Stripe timeout (30s delay)
- ✅ Request times out after 10s (not 60s)
- ✅ Circuit breaker opens after 5 errors
- ✅ Fallback queues payment
- ✅ Alert fires within 5 minutes
- ✅ Oncall follows runbook, resolves in < 10 minutes

**Success criteria**: Same incident mitigated 3x faster (10min vs 30min)

---

## 7) Tracking Notes

**Epic**: [JIRA-500] "Payment API Timeout - Postmortem Actions"
**Tickets**: [JIRA-501] through [JIRA-507]
**Follow-up**: 2025-01-24 (P0 review), 2025-02-14 (P1 review), 2025-03-31 (retrospective)
```

---

## EXAMPLE OUTPUT 2: PII in Logs

**Scenario**: Customer email addresses logged in plaintext to Datadog, violating GDPR.

**RCA summary**:
- Wide-event logging included user objects with email field
- No PII redaction configured in logger
- Discovered during security audit (not reported by customer)
- 2 years of logs contain PII (retention = 2 years)

**Capacity**: High (this is a compliance issue)
**Prioritization**: Impact-first

```markdown
# Postmortem Action Plan
**Incident**: PII in Logs (GDPR Violation)
**Date**: 2025-01-12
**Scope**: org (affects all services)
**Capacity**: high

---

## 0) Summary

**Incident theme**: PII exposure in logs due to missing redaction

**Primary failure mode**: Logger configuration included full user objects (including email) without PII redaction

**Top prevention leverage point**: Add logger middleware to automatically redact PII fields

**Blast radius**:
- Users affected: 500,000 (all users with logs in last 2 years)
- Duration: 2 years (since logging introduced)
- Business impact: GDPR compliance risk, potential €20M fine (4% of annual revenue)

**Action summary**:
- Total actions: 10
- P0: 4 actions (rotate API keys, purge logs, add redaction, audit all services)
- P1: 4 actions (GDPR compliance review, PII detection CI check, privacy training, DPO notification)
- P2: 2 actions (log retention policy, automated compliance scans)

---

## 1) Action Items (Prioritized Table)

| ID | Category | Action | Priority | Effort | Owner | Done When | Due |
|----|----------|--------|----------|--------|-------|-----------|-----|
| A1 | Security | Rotate Datadog API keys | P0 | S | @security | Keys rotated, old keys revoked | 2025-01-13 |
| A2 | Security | Purge PII from Datadog logs | P0 | M | @security | PII purged, verified | 2025-01-19 |
| A3 | Prevention | Add PII redaction to logger | P0 | M | @platform | Deployed to all services | 2025-01-19 |
| A4 | Detection | Audit all services for PII in logs | P0 | L | @platform | 100% services audited | 2025-01-26 |
| A5 | Process | GDPR compliance review | P1 | L | @legal | DPO sign-off | 2025-02-09 |
| A6 | Process | Add PII detection CI check | P1 | M | @platform | CI blocks PII in logs | 2025-02-09 |
| A7 | Process | Privacy training for eng team | P1 | M | @security | 100% eng trained | 2025-02-09 |
| A8 | Process | Notify DPO, prepare breach report | P1 | S | @legal | DPO notified, report ready | 2025-01-19 |
| A9 | Process | Update log retention to 90 days | P2 | S | @platform | Retention = 90 days | 2025-03-12 |
| A10 | Detection | Add automated PII scan (monthly) | P2 | M | @security | Scan running monthly | 2025-03-12 |

---

## 2) Immediate Actions (P0)

### A1: Rotate Datadog API keys
**Category**: Security
**Owner**: @security
**Due**: 2025-01-13 (TODAY)

**Rationale**: Logs with PII are accessible via API. Rotating keys limits exposure.

**Action**:
1. Create new Datadog API key
2. Update all services to use new key
3. Revoke old API key
4. Verify no services using old key

```bash
# 1. Create new key in Datadog UI
# 2. Update secrets in AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id prod/datadog/api-key \
  --secret-string "new-api-key-here"

# 3. Restart all services to pick up new key
kubectl rollout restart deployment -n production

# 4. Revoke old key in Datadog UI
```

**Done when**: Old API key revoked, all services using new key, verified in Datadog audit log

---

### A2: Purge PII from Datadog logs
**Category**: Security
**Owner**: @security
**Due**: 2025-01-19

**Rationale**: 2 years of logs contain PII. Must purge to comply with GDPR.

**Action**:
1. Identify log indexes with PII (search for `user.email`)
2. Create Datadog support ticket to purge logs
3. Verify purge completed
4. Document purge for compliance audit

```bash
# 1. Search for PII in logs
curl -X POST "https://api.datadoghq.com/api/v1/logs-queries/list" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -d '{"query": "user.email:*", "time": {"from": "now-2y"}}'

# 2. Request purge from Datadog support
# Subject: "GDPR PII Purge Request - Urgent"
# Body: "Please purge all logs matching query 'user.email:*' from 2023-01-01 to 2025-01-12"

# 3. Verify purge (should return 0 results)
curl -X POST "https://api.datadoghq.com/api/v1/logs-queries/list" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -d '{"query": "user.email:*", "time": {"from": "now-2y"}}'
```

**Done when**: Datadog confirms purge, search returns 0 results, purge documented

---

### A3: Add PII redaction to logger
**Category**: Prevention
**Owner**: @platform
**Due**: 2025-01-19

**Rationale**: Prevent future PII exposure by redacting sensitive fields automatically.

**Action**: Update logger configuration to redact PII fields.

```typescript
// src/lib/logger.ts

import pino from 'pino';

// Define PII fields to redact
const PII_FIELDS = [
  'email',
  'phone',
  'ssn',
  'credit_card',
  'ip_address',
  'address',
  'passport'
];

// Redaction function
function redact(obj: any, fields: string[]): any {
  if (typeof obj !== 'object' || obj === null) return obj;

  const redacted = { ...obj };

  for (const key of Object.keys(redacted)) {
    if (fields.includes(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redact(redacted[key], fields);
    }
  }

  return redacted;
}

// Create logger with automatic redaction
export const logger = pino({
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      // Redact user object
      user: req.user ? redact(req.user, PII_FIELDS) : undefined
    }),
    user: (user) => redact(user, PII_FIELDS),
    event: (event) => redact(event, PII_FIELDS)
  }
});

// ✅ AFTER: Email redacted
logger.info({ user: { id: 123, email: 'test@example.com' } }, 'User logged in');
// Output: {"user":{"id":123,"email":"[REDACTED]"},"msg":"User logged in"}
```

**Rollout plan**:
1. Deploy to staging, verify redaction works
2. Deploy to 1 prod service (canary)
3. Monitor for 24h (no regressions)
4. Deploy to all prod services

**Done when**: Deployed to all services, verified with log sampling (no PII visible)

---

### A4: Audit all services for PII in logs
**Category**: Detection
**Owner**: @platform
**Due**: 2025-01-26

**Rationale**: Verify no other services are logging PII beyond user.email.

**Action**: Automated scan + manual review of all services.

```bash
# 1. Clone all service repos
for repo in $(gh repo list myorg --limit 100 --json name -q '.[].name'); do
  gh repo clone "myorg/$repo"
done

# 2. Search for PII logging patterns
rg --type typescript --type javascript \
  -e 'logger.*email' \
  -e 'logger.*phone' \
  -e 'logger.*ssn' \
  -e 'logger.*credit_card' \
  -e 'logger.*password' \
  -e 'console.log.*user' \
  -g '!node_modules' \
  -g '!dist' \
  > pii-audit-results.txt

# 3. Review each match manually
# 4. Create tickets for any PII found
```

**Checklist**:
- [ ] Search for `logger.*(email|phone|ssn|address)`
- [ ] Search for `console.log.*(user|customer|account)`
- [ ] Review Datadog logs for PII fields (beyond email)
- [ ] Check third-party integrations (Sentry, LogRocket)
- [ ] Document findings in spreadsheet

**Done when**: All 50 services audited, findings documented, tickets created for violations

---

## 3) Short-Term Actions (P1)

### A5: GDPR compliance review
**Category**: Process
**Owner**: @legal
**Due**: 2025-02-09

**Rationale**: Assess full GDPR impact, determine if breach notification required.

**Action**:
1. Legal review of incident
2. Determine if breach notification required (unlikely since logs are internal)
3. Update privacy policy if needed
4. Prepare response for potential regulator inquiry

**Done when**: DPO signs off on compliance review, breach notification decision documented

---

### A6: Add PII detection CI check
**Category**: Process
**Owner**: @platform
**Due**: 2025-02-09

**Rationale**: Prevent future PII logging via CI checks.

**Action**: Add GitHub Action to detect PII logging patterns.

```yaml
# .github/workflows/pii-check.yml
name: PII Detection
on: [pull_request]

jobs:
  pii-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Check for PII in logs
        run: |
          # Fail if logging user.email, user.phone, etc. without redaction
          if grep -r "logger.*user\.email" src/; then
            echo "ERROR: Logging user.email without redaction"
            exit 1
          fi

          if grep -r "logger.*user\.phone" src/; then
            echo "ERROR: Logging user.phone without redaction"
            exit 1
          fi

          # Fail if using console.log with user objects
          if grep -r "console\.log.*user" src/; then
            echo "WARNING: Using console.log with user object (use logger instead)"
            exit 1
          fi
```

**Done when**: CI check added to all repos, blocks PRs with PII logging

---

### A7: Privacy training for engineering team
**Category**: Process
**Owner**: @security
**Due**: 2025-02-09

**Rationale**: Prevent similar issues via training.

**Training content**:
- What is PII (email, phone, SSN, address, etc.)
- GDPR requirements (consent, retention, right to erasure)
- How to log safely (redaction, hashing, tokenization)
- PII in other systems (databases, caches, backups)

**Done when**: 100% of engineering team completes training, quiz passed (80% score)

---

### A8: Notify DPO, prepare breach report
**Category**: Process
**Owner**: @legal
**Due**: 2025-01-19

**Rationale**: DPO must be notified within 72 hours (GDPR requirement).

**Action**:
1. Notify DPO immediately
2. Prepare breach report with:
   - Nature of breach (PII in logs)
   - Number of users affected (500,000)
   - Actions taken (purge, redaction, audit)
   - Likelihood of harm (low - internal logs only)
3. Determine if regulator notification required (likely not)

**Done when**: DPO notified, breach report prepared and reviewed

---

## 4) Longer-Term Actions (P2)

### A9: Update log retention to 90 days
**Category**: Process
**Owner**: @platform
**Due**: 2025-03-12

**Rationale**: Reduce GDPR risk by shortening log retention (2 years → 90 days).

**Action**:
```bash
# Update Datadog index retention
curl -X PUT "https://api.datadoghq.com/api/v1/logs/config/indexes/main" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -d '{"retention_days": 90}'
```

**Done when**: Retention = 90 days for all indexes, documented in wiki

---

### A10: Add automated PII scan (monthly)
**Category**: Detection
**Owner**: @security
**Due**: 2025-03-12

**Rationale**: Catch future PII exposure before it becomes 2-year incident.

**Action**: Create monthly GitHub Action to scan Datadog logs.

```yaml
# .github/workflows/pii-scan.yml
name: Monthly PII Scan
on:
  schedule:
    - cron: '0 0 1 * *'  # 1st of every month

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Scan Datadog for PII
        run: |
          # Search for PII patterns
          RESULTS=$(curl -X POST "https://api.datadoghq.com/api/v1/logs-queries/list" \
            -H "DD-API-KEY: $DD_API_KEY" \
            -d '{"query": "email:* OR phone:* OR ssn:*", "time": {"from": "now-7d"}}')

          # Alert if PII found
          if [ $(echo $RESULTS | jq '.data | length') -gt 0 ]; then
            echo "ERROR: PII detected in logs"
            # Send alert to security team
            curl -X POST https://hooks.slack.com/services/XXX \
              -d '{"text": "PII detected in Datadog logs!"}'
            exit 1
          fi
```

**Done when**: Scan runs monthly, alerts security team if PII found

---

## 5) Detection Coverage Map

| Signal | Before | After P0 | After P1 | After P2 |
|--------|--------|----------|----------|----------|
| PII in logs | ❌ | ✅ Audit complete | ✅ CI blocks | ✅ Monthly scan |
| Logger config | ❌ | ✅ Redaction enabled | ✅ Tested in staging | ✅ All services |
| Compliance | ❌ | ✅ DPO notified | ✅ GDPR review done | ✅ Automated |
| Training | ❌ | ❌ | ✅ 100% eng trained | ✅ New hire onboarding |

---

## 6) Validation Plan

**Manual review**: Sample 1000 logs from each service
- ✅ No email, phone, SSN visible
- ✅ PII fields show `[REDACTED]`

**CI check**: Create PR with `logger.info({ user: { email: 'test@example.com' }})`
- ✅ CI blocks PR with error message

**Monthly scan**: Simulate PII in logs (staging)
- ✅ Scan detects PII within 1 day
- ✅ Alert sent to security team

---

## 7) Tracking Notes

**Epic**: [JIRA-600] "PII in Logs - GDPR Incident - Postmortem Actions"
**Priority**: P0 (compliance risk)
**Tickets**: [JIRA-601] through [JIRA-610]
**Follow-up**:
- 2025-01-19 (1 week): P0 review (purge, redaction, audit)
- 2025-02-09 (4 weeks): P1 review (compliance, CI, training)
- 2025-03-31 (10 weeks): Retrospective + DPO sign-off
```

---

## TIPS FOR CREATING EFFECTIVE ACTION PLANS

### 1. Be Specific and Measurable
- ❌ BAD: "Improve logging"
- ✅ GOOD: "Add alert on p95 query latency > 1s"

### 2. Assign Clear Ownership
- ❌ BAD: "Team should fix this"
- ✅ GOOD: "@alice will create migration PR by 2025-01-22"

### 3. Define "Done When" Criteria
- ❌ BAD: "Deploy to production"
- ✅ GOOD: "Deployed to prod, monitored for 7 days, no regressions"

### 4. Balance Quick Wins and Long-Term Fixes
- **P0**: Prevent immediate recurrence (quick wins)
- **P1**: Strengthen reliability (medium effort)
- **P2**: Improve observability (long-term value)

### 5. Focus on Detection and Response, Not Just Prevention
- **Prevention**: Fix the bug
- **Detection**: Alert when similar bug occurs
- **Response**: Runbook for faster mitigation

### 6. Use Real Code Examples
- Include actual code snippets (before/after)
- Make it copy-pasteable for engineers
- Link to relevant documentation

### 7. Validate Actions After Completion
- Load tests, chaos tests, simulated incidents
- Measure MTTR reduction, detection latency
- Document validation results

### 8. Track and Follow Up
- Create tickets in tracking system
- Schedule follow-up meetings (1 week, 1 month, 1 quarter)
- Report rollup to leadership

---

**End of /postmortem-actions command**
