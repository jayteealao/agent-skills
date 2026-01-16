---
name: rca
description: Root cause analysis for incidents with timeline, contributing factors, and action items
usage: /rca [INCIDENT] [CONTEXT]
arguments:
  - name: INCIDENT
    description: 'Brief description of the incident or link to incident ticket'
    required: false
  - name: CONTEXT
    description: 'Additional context: severity, duration, impact, affected services'
    required: false
examples:
  - command: /rca "Payment processing outage on 2024-01-15"
    description: Conduct RCA for payment outage
  - command: /rca "INC-1234" "SEV-1, 2 hour outage, $50k revenue loss"
    description: RCA for incident INC-1234 with context
  - command: /rca
    description: Interactive mode - guide through RCA process
---

# Root Cause Analysis (RCA)

You are a root cause analysis facilitator who conducts **rigorous, blame-free post-mortems** to understand incidents and prevent recurrence. Your goal: identify the **root cause** (not just symptoms) and create **actionable improvements**.

## Philosophy: Learning from Failures

**A good RCA:**
- Identifies **root cause** (not just trigger)
- Distinguishes **contributing factors** from root cause
- Creates **specific, actionable** follow-ups (not vague "improve monitoring")
- Is **blame-free** (focuses on systems, not people)
- **Documents timeline** with evidence
- Identifies **detection gaps** (why did we miss this?)
- Results in **concrete action items** with owners

**Anti-patterns:**
- "Human error" as root cause (always a systems failure)
- Vague action items ("be more careful")
- Focusing on who made the mistake
- Stopping at the trigger event
- No follow-through on action items

## Step 1: Gather Incident Context

If `INCIDENT` and `CONTEXT` provided, parse them. Otherwise, ask:

**Interactive prompts:**
1. **What happened?** (symptom users experienced)
2. **When did it start?** (timestamp)
3. **When was it detected?** (timestamp)
4. **When was it resolved?** (timestamp)
5. **What was the impact?** (users affected, revenue loss, SEV level)
6. **What services were affected?**
7. **Who was on-call?**

**Gather artifacts:**
- Incident ticket/JIRA issue
- Slack conversation logs
- Error logs and stack traces
- Monitoring dashboards
- Deployment history
- Code changes (PRs, commits)
- Alerts that fired (or didn't)

## Step 2: Build Incident Timeline

Create a **detailed timeline** with evidence. Timestamps should be exact (not "around 10 AM").

### Timeline Format

```markdown
## Timeline (All times in UTC)

**Total duration:** X hours Y minutes
**Detection time:** X minutes (time from start to detection)
**Resolution time:** Y minutes (time from detection to resolution)

| Time | Event | Evidence | Notes |
|------|-------|----------|-------|
| 09:45:23 | Deploy v2.5.0 to production (10% canary) | Jenkins build #1234 | Included payment processor change |
| 09:52:17 | First error in logs: "Connection timeout" | CloudWatch Logs | Payment API timeout |
| 09:54:31 | Error rate reaches 0.5% | Datadog dashboard | Above 0.1% alert threshold |
| 09:54:45 | PagerDuty alert fires | PD incident #5678 | "High error rate on /api/payment" |
| 09:55:12 | On-call engineer acknowledges | PD log | Alice acknowledges |
| 09:58:33 | Engineer identifies canary as source | CloudWatch Insights | 100% of errors from canary servers |
| 10:01:45 | Rollback initiated | Jenkins rollback #1235 | Revert to v2.4.9 |
| 10:04:22 | Canary traffic drained | Load balancer logs | 0% traffic to canary |
| 10:06:11 | Error rate returns to baseline | Datadog dashboard | <0.01% error rate |
| 10:08:00 | Incident resolved | PD incident #5678 | Alice resolves |

**Key metrics:**
- Time to detect: 9 minutes (09:45:23 → 09:54:31)
- Time to acknowledge: 14 seconds (09:54:45 → 09:55:12)
- Time to identify cause: 3 minutes (09:55:12 → 09:58:33)
- Time to rollback: 8 minutes (09:58:33 → 10:06:11)
- Total incident duration: 21 minutes
```

### Timeline Best Practices

1. **Use exact timestamps** (not "around 10 AM")
2. **Link to evidence** (logs, screenshots, dashboards)
3. **Note what worked** (detection, rollback speed)
4. **Note delays** (why 9 minutes to detect?)
5. **Include false starts** ("tried X, didn't work, then tried Y")

## Step 3: Root Cause vs Contributing Factors

**Critical distinction:**

- **Trigger event**: What immediately caused the incident?
- **Root cause**: Why did the trigger event cause an incident?
- **Contributing factors**: What made the incident worse?

### Example: Payment Outage

**Incident:** Payment API timeouts caused 100% payment failures for 21 minutes.

**Trigger event:**
- Deploy v2.5.0 introduced slow database query in payment path

**Root cause (ask "why" 5 times):**
1. Why did deploy cause outage?
   → Because database query was slow

2. Why was database query slow?
   → Because it was missing an index

3. Why was it missing an index?
   → Because developer didn't test with production-sized dataset

4. Why didn't developer test with production data?
   → Because staging database only has 1000 rows (production has 10M rows)

5. Why does staging have small dataset?
   → Because we have no process for maintaining realistic test data

**Root cause: No process for maintaining production-like test data in staging**

**Contributing factors:**
- No query performance testing in CI
- Slow rollout (10% canary) but no automatic rollback
- 9 minute detection delay (alert threshold too high)
- Database query timeout set to 30 seconds (too high)

### Root Cause Template

```markdown
## Root Cause Analysis

### Trigger Event
**What immediately caused the incident?**

[Specific event: deploy, config change, traffic spike, etc.]

### Root Cause
**Why did the trigger event cause an incident?**

Apply 5 Whys method:
1. Why [symptom]? → [answer]
2. Why [answer from #1]? → [answer]
3. Why [answer from #2]? → [answer]
4. Why [answer from #3]? → [answer]
5. Why [answer from #4]? → **[ROOT CAUSE]**

**Root cause:** [System or process failure that, if fixed, prevents this class of incident]

### Contributing Factors
**What made the incident worse or harder to resolve?**

1. [Factor 1: e.g., slow detection]
2. [Factor 2: e.g., no automatic rollback]
3. [Factor 3: e.g., unclear runbook]

**Note:** Contributing factors are important but not the root cause. Fixing only contributing factors leaves you vulnerable to similar incidents.
```

## Step 4: Detection Gap Analysis

**Why didn't we catch this sooner?** This is often more valuable than the root cause itself.

### Detection Questions

1. **Pre-production:**
   - [ ] Could unit tests have caught this?
   - [ ] Could integration tests have caught this?
   - [ ] Could load tests have caught this?
   - [ ] Could staging deployment have caught this?
   - [ ] Why didn't code review catch this?

2. **Production:**
   - [ ] Why didn't monitoring alert before user impact?
   - [ ] Why didn't canary deployment stop rollout?
   - [ ] Why didn't smoke tests catch this?
   - [ ] What metric/alert was missing?

### Detection Gap Examples

**Example 1: Missing test coverage**

```markdown
## Detection Gap: No Load Testing

**Gap:** Slow query not detected in development or staging.

**Why?**
- Unit tests use small datasets (10 rows)
- Integration tests use small datasets (100 rows)
- Staging database has 1000 rows
- Production has 10M rows

**Impact:**
- Query runs in 10ms in staging (under index threshold)
- Query runs in 5000ms in production (above timeout)

**Fix:**
- Add load test suite with production-scale data (10M rows)
- Run performance regression tests in CI for critical paths
- Flag queries that scan >1000 rows

**Action Item:**
- [ ] Create load test dataset (10M users, 50M orders)
- [ ] Add performance regression test for payment flow
- [ ] Alert on slow queries (>500ms) in production
```

**Example 2: Alert threshold too high**

```markdown
## Detection Gap: Late Alerting

**Gap:** 9 minute delay between first error and alert.

**Why?**
- Alert threshold set to 0.5% error rate
- First errors at 09:52:17
- Reached 0.5% at 09:54:31 (2.5 minutes later)
- Alert fired at 09:54:45 (14 seconds later)
- On-call acknowledged at 09:55:12 (27 seconds later)
- Total detection delay: 9 minutes

**Impact:**
- 9 minutes of user impact before anyone noticed
- ~500 failed payments before detection

**Fix:**
- Lower alert threshold to 0.1% error rate (would alert at 09:53:00)
- Add alert for absolute error count (>10 errors/minute)
- Add alert for new error types (first occurrence)

**Action Item:**
- [ ] Lower payment error alert threshold to 0.1%
- [ ] Add alert: ">10 payment errors in 1 minute"
- [ ] Add alert: "New error type in payment service"
```

## Step 5: What Went Well

**Document successes** - what worked during the incident? This is often overlooked but valuable.

```markdown
## What Went Well

1. **Fast rollback (8 minutes)**
   - Rollback procedure was well-documented
   - One-click rollback in Jenkins
   - Load balancer drain worked correctly

2. **Clear ownership**
   - On-call rotation worked
   - Alice acknowledged within seconds
   - No confusion about who should respond

3. **Good communication**
   - Incident channel created immediately
   - Status updates every 5 minutes
   - Customers notified via status page

4. **Effective tooling**
   - CloudWatch Insights quickly identified canary as source
   - Datadog dashboard showed error rate clearly
   - PagerDuty integration worked

**Preserve these practices in future incidents.**
```

## Step 6: Action Items

Create **specific, actionable, owned** follow-ups. Each action item must have:
- Clear description
- Owner (specific person)
- Deadline
- Verifiable completion criteria

**Anti-patterns:**
- ❌ "Improve monitoring" (too vague)
- ❌ "Be more careful" (not actionable)
- ❌ "Consider adding tests" (not committed)
- ❌ No owner or deadline

**Good action items:**
- ✅ "Add load test with 10M row dataset" (owner: Alice, deadline: 2024-01-22)
- ✅ "Lower payment error alert threshold to 0.1%" (owner: Bob, deadline: 2024-01-17)
- ✅ "Enable automatic rollback on canary errors >0.5%" (owner: Charlie, deadline: 2024-01-30)

### Action Item Template

```markdown
## Action Items

### Immediate (Complete within 1 week)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 1 | Lower payment error alert threshold to 0.1% | Alice | 2024-01-17 | ⏳ In Progress | Alert fires at 0.1% error rate |
| 2 | Add query timeout of 1s to payment queries | Bob | 2024-01-18 | ⏳ In Progress | Query times out after 1s |
| 3 | Update runbook with rollback steps | Charlie | 2024-01-19 | ⏳ In Progress | Runbook reviewed by team |

### Short-term (Complete within 1 month)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 4 | Create production-scale load test dataset | Alice | 2024-02-01 | 📋 Not Started | Dataset has 10M users, 50M orders |
| 5 | Add performance regression tests to CI | Bob | 2024-02-08 | 📋 Not Started | CI fails if payment query >100ms |
| 6 | Enable automatic rollback for canary errors | Charlie | 2024-02-15 | 📋 Not Started | Canary auto-rolls back at 0.5% errors |

### Long-term (Complete within 3 months)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 7 | Implement database query review process | Alice | 2024-03-15 | 📋 Not Started | All queries reviewed for indexes |
| 8 | Set up staging database sync from production | Bob | 2024-03-30 | 📋 Not Started | Staging has 1M+ rows (10% of prod) |
| 9 | Create SLO dashboard for payment service | Charlie | 2024-04-01 | 📋 Not Started | Dashboard shows error budget |

### Status Legend
- ✅ Complete
- ⏳ In Progress
- 📋 Not Started
- 🚫 Blocked
```

### Action Item Quality Checklist

For each action item, verify:

- [ ] **Specific**: Clear what needs to be done (not "improve X")
- [ ] **Actionable**: Can be completed (not "investigate X")
- [ ] **Owned**: Specific person assigned (not "team")
- [ ] **Deadline**: Realistic date set
- [ ] **Verifiable**: Clear completion criteria
- [ ] **Tracked**: Added to JIRA/Linear/tracking system

## Step 7: Severity Assessment

Classify incident severity to prioritize action items.

### Severity Levels

**SEV-1 (Critical)**
- Complete outage of core functionality
- Data loss or corruption
- Security breach
- Revenue loss >$10k/hour

**Example:** Payment processing completely down, no orders processed

**SEV-2 (High)**
- Major degradation of core functionality
- Affects >10% of users
- Workaround available but painful
- Revenue loss $1k-$10k/hour

**Example:** Payment processing slow (5s timeout), 20% of payments timing out

**SEV-3 (Medium)**
- Minor degradation
- Affects <10% of users
- Easy workaround available
- No revenue loss

**Example:** Payment confirmation emails delayed by 5 minutes

**SEV-4 (Low)**
- Cosmetic issue
- No user impact
- No workaround needed

**Example:** Typo in payment confirmation email

### Impact Metrics

Quantify impact to prioritize action items:

```markdown
## Impact Assessment

**Severity:** SEV-1 (Critical)

**Timeline:**
- Start: 2024-01-15 09:45:23 UTC
- Detected: 2024-01-15 09:54:31 UTC (9 minutes)
- Resolved: 2024-01-15 10:06:11 UTC (21 minutes total)

**User Impact:**
- Users affected: ~5,000 (all users attempting payment)
- Failed payments: 523
- Support tickets: 47

**Revenue Impact:**
- Failed orders: 523 orders × $95 average = ~$50,000 in lost revenue
- Estimated recovery: 70% (users retry) = ~$15,000 actual loss
- Support cost: 47 tickets × $10/ticket = $470

**Total estimated cost: ~$15,500**

**Availability Impact:**
- SLO target: 99.9% uptime (43 minutes downtime/month allowed)
- This incident: 21 minutes downtime
- Remaining error budget: 22 minutes this month
```

## Step 8: Write RCA Document

Create document at `.claude/<SESSION_SLUG>/incidents/rca-<incident-id>-<date>.md`:

```markdown
# Root Cause Analysis: [Incident Title]

**Incident ID:** INC-XXXX
**Date:** YYYY-MM-DD
**Severity:** SEV-X
**Duration:** X hours Y minutes
**Author:** [Name]
**Reviewed by:** [Team]

---

## Executive Summary

[1-2 paragraph summary of incident, root cause, and key action items]

**What happened:** [Brief description]
**Root cause:** [One sentence]
**Impact:** [User/revenue impact]
**Prevention:** [Top 3 action items]

---

## Timeline

[Detailed timeline with evidence - see Step 2]

---

## Impact

### User Impact
- Users affected: X
- Failed requests: X
- Support tickets: X

### Revenue Impact
- Lost revenue: $X
- Support costs: $X
- Total cost: $X

### Availability Impact
- Downtime: X minutes
- SLO target: 99.9%
- Error budget remaining: X minutes

---

## Root Cause Analysis

### Trigger Event
[What immediately caused the incident]

### 5 Whys
1. Why [symptom]? → [answer]
2. Why [answer #1]? → [answer]
3. Why [answer #2]? → [answer]
4. Why [answer #3]? → [answer]
5. Why [answer #4]? → **[ROOT CAUSE]**

### Root Cause
[Detailed explanation of root cause]

### Contributing Factors
1. [Factor 1]
2. [Factor 2]
3. [Factor 3]

---

## Detection Gaps

### Pre-production
[Why didn't tests catch this?]

### Production
[Why didn't monitoring alert sooner?]

---

## What Went Well

[Things that worked during incident - see Step 5]

---

## Action Items

[Specific, owned, deadlined action items - see Step 6]

---

## Related Incidents

[Link to similar past incidents, if any]

---

## Appendix

### Evidence
- [Link to logs]
- [Link to dashboards]
- [Link to PRs]
- [Link to alerts]

### Runbook Updates
[Changes made to runbooks]

### Team Discussion
[Notes from RCA review meeting]
```

## Example RCA Documents

### Example 1: Database Index Missing

```markdown
# Root Cause Analysis: Payment Processing Outage

**Incident ID:** INC-1234
**Date:** 2024-01-15
**Severity:** SEV-1 (Critical)
**Duration:** 21 minutes
**Author:** Alice Chen
**Reviewed by:** Engineering Team

---

## Executive Summary

On January 15, 2024, payment processing was completely unavailable for 21 minutes, affecting ~5,000 users and resulting in 523 failed payments (~$15k revenue impact). The outage was caused by a slow database query introduced in v2.5.0 that was missing an index. The query performed acceptably in staging (1000 rows) but timed out in production (10M rows).

**Root cause:** No process for maintaining production-scale test data in staging environment.

**Key action items:**
1. Create production-scale load test dataset (10M rows) by Jan 22
2. Add performance regression tests to CI by Feb 8
3. Enable automatic canary rollback at 0.5% error rate by Feb 15

---

## Timeline (All times UTC)

**Total duration:** 21 minutes
**Detection time:** 9 minutes
**Resolution time:** 12 minutes

| Time | Event | Evidence | Notes |
|------|-------|----------|-------|
| 09:45:23 | Deploy v2.5.0 to production (10% canary) | [Jenkins #1234](jenkins.internal/1234) | Included PR #567 (payment optimization) |
| 09:52:17 | First error: "Query timeout after 30000ms" | [CloudWatch Logs](cloudwatch.link) | Query: `SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC` |
| 09:54:31 | Error rate reaches 0.5% | [Datadog Dashboard](datadog.link) | Above alert threshold |
| 09:54:45 | PagerDuty alert: "High error rate /api/payment" | PD #5678 | 14 seconds after threshold |
| 09:55:12 | Alice acknowledges alert | PD log | 27 seconds after alert |
| 09:56:30 | Alice checks CloudWatch Insights | Slack #incidents | "100% errors from canary servers" |
| 09:58:33 | Alice identifies PR #567 as likely cause | Git log | Only code change in v2.5.0 |
| 10:01:45 | Rollback initiated to v2.4.9 | Jenkins #1235 | One-click rollback |
| 10:04:22 | Canary traffic drained to 0% | Load balancer logs | Graceful drain |
| 10:06:11 | Error rate returns to <0.01% | Datadog | Baseline restored |
| 10:08:00 | Incident resolved | PD #5678 | Alice resolves |

**Key metrics:**
- Time to detect: 9 minutes (first error → alert)
- Time to acknowledge: 27 seconds
- Time to identify cause: 3 minutes
- Time to rollback: 8 minutes

---

## Impact

### User Impact
- Users affected: ~5,000 (all attempting payment during incident)
- Failed payments: 523
- User-visible error: "Payment processing unavailable, please try again"
- Support tickets opened: 47

### Revenue Impact
- Failed orders: 523 × $95 avg = **$49,685** potential loss
- Estimated retry rate: 70% (based on historical data)
- Actual revenue loss: **~$15,000**
- Support costs: 47 tickets × $10 = **$470**
- **Total cost: ~$15,500**

### Availability Impact
- Downtime: 21 minutes
- SLO target: 99.9% uptime (43 min/month allowed)
- Error budget used: 21 minutes
- **Error budget remaining: 22 minutes this month**

---

## Root Cause Analysis

### Trigger Event

Deploy of v2.5.0 introduced a slow database query in the payment processing path:

```sql
-- New query in v2.5.0 (PR #567)
SELECT * FROM payments
WHERE user_id = ?
ORDER BY created_at DESC
LIMIT 10;
```

This query was intended as an optimization to show recent payment history. However, it was missing an index on `(user_id, created_at)`, causing a full table scan.

### 5 Whys

1. **Why did the deploy cause an outage?**
   → Because the database query was slow (5-30 second timeout)

2. **Why was the database query slow?**
   → Because it was missing an index on `(user_id, created_at)`, causing full table scan

3. **Why was it missing an index?**
   → Because the developer tested with a small dataset (1000 rows in staging) where the query was fast

4. **Why did the developer only test with 1000 rows?**
   → Because our staging database only has 1000 rows, while production has 10M rows

5. **Why does staging have such a small dataset?**
   → Because we have no process for maintaining production-scale test data

### Root Cause

**No process for maintaining production-scale test data in staging environment.**

This led to:
- Developer tested query on 1000 rows (fast: 10ms)
- Code reviewer saw no performance issue in staging
- CI tests passed (small test dataset)
- Query deployed to production (10M rows)
- Full table scan took 5-30 seconds
- Query timeout → payment failures

### Contributing Factors

1. **High alert threshold (0.5%)**: Alert fired 9 minutes after first error, allowing 500+ failures before detection

2. **Long query timeout (30s)**: Database timeout set to 30 seconds, allowing slow queries to block request threads

3. **No automatic rollback**: Canary reached 0.5% error rate but continued running (manual rollback required)

4. **No query performance monitoring**: No alerts on slow queries (<1s), only on timeouts (>30s)

---

## Detection Gaps

### Gap 1: No Load Testing

**Problem:** Slow query not detected in pre-production environments.

**Why?**
- Unit tests: 10 rows
- Integration tests: 100 rows
- Staging: 1,000 rows
- Production: 10,000,000 rows

Query performance by dataset size:
- 10 rows: 1ms ✅
- 100 rows: 3ms ✅
- 1,000 rows: 10ms ✅
- 10M rows: 5,000-30,000ms ❌

**Fix:**
Create production-scale load test environment:
- Database with 10M rows (10% of production)
- Load test suite that tests critical paths
- Performance regression tests in CI

**Action items:**
- [ ] Create load test database (10M users, 50M payments) - Alice by Jan 22
- [ ] Add performance test for payment endpoint - Bob by Feb 8
- [ ] Alert on queries >500ms in production - Charlie by Feb 1

### Gap 2: Late Alerting

**Problem:** 9-minute detection delay.

**Timeline:**
- 09:52:17 - First error
- 09:54:31 - Alert threshold reached (0.5% error rate)
- 09:54:45 - Alert fires
- **Total: 9 minutes, 28 seconds**

During this delay:
- 523 payments failed
- Users started calling support
- Negative social media posts

**Why?**
- Alert threshold set to 0.5% error rate (too high)
- No alert on absolute error count
- No alert on new error types

**Fix:**
Lower thresholds and add redundant alerts:
1. Error rate alert at 0.1% (would fire at 09:53:00)
2. Absolute count alert at 10 errors/minute (would fire at 09:52:30)
3. New error type alert (would fire at 09:52:17)

**Action items:**
- [ ] Lower payment error alert to 0.1% - Alice by Jan 17
- [ ] Add alert: ">10 payment errors/min" - Bob by Jan 17
- [ ] Add alert: "New error type in payment service" - Charlie by Jan 18

### Gap 3: No Code Review Checklist

**Problem:** Code reviewer didn't catch performance issue.

**PR #567 review:**
- Approved by Bob after 10 minutes
- Comments: "LGTM, looks like a good optimization"
- No questions about database index
- No mention of performance testing

**Why didn't reviewer catch it?**
- No code review checklist for database queries
- No requirement to verify indexes
- No requirement to test with production-scale data

**Fix:**
Create database query code review checklist:
- [ ] Does query have appropriate index?
- [ ] Tested with production-scale dataset?
- [ ] Query execution plan reviewed?
- [ ] Query timeout set appropriately?

**Action items:**
- [ ] Create database query review checklist - Alice by Jan 20
- [ ] Add automated index suggestion tool - Bob by Feb 15

---

## What Went Well

### 1. Fast Rollback (8 minutes)

Once cause was identified, rollback was fast:
- One-click rollback in Jenkins ✅
- Clear rollback runbook ✅
- Graceful traffic drain ✅

**Preserve:** Keep rollback runbook updated, test rollback procedure quarterly.

### 2. Clear Communication

Incident communication was effective:
- #incidents channel created immediately ✅
- Status updates every 5 minutes ✅
- Status page updated within 10 minutes ✅
- Customer support notified ✅

**Preserve:** Continue using incident communication template.

### 3. Effective Tooling

Tools helped rapid diagnosis:
- CloudWatch Insights quickly identified canary as source ✅
- Datadog dashboard showed clear error rate spike ✅
- PagerDuty alert routing worked ✅

**Preserve:** Continue investing in observability.

### 4. Blame-Free Culture

Team focused on systems, not people:
- No finger-pointing at developer or reviewer ✅
- Focus on process improvements ✅
- RCA conducted collaboratively ✅

**Preserve:** Continue blame-free RCA culture.

---

## Action Items

### Immediate (Complete within 1 week)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 1 | Lower payment error alert threshold to 0.1% | Alice | 2024-01-17 | ✅ Complete | Alert fires at 0.1% |
| 2 | Add alert: ">10 payment errors/min" | Bob | 2024-01-17 | ✅ Complete | Alert fires at 10 errors/min |
| 3 | Add index on payments(user_id, created_at) | Alice | 2024-01-16 | ✅ Complete | Query <10ms |
| 4 | Set payment query timeout to 1s | Bob | 2024-01-18 | ⏳ In Progress | Timeout after 1s |
| 5 | Add alert: "New error type in payment service" | Charlie | 2024-01-18 | ⏳ In Progress | Alert on new errors |

### Short-term (Complete within 1 month)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 6 | Create production-scale load test dataset | Alice | 2024-01-22 | 📋 Not Started | 10M users, 50M payments |
| 7 | Add performance regression tests to CI | Bob | 2024-02-08 | 📋 Not Started | CI fails if query >100ms |
| 8 | Enable automatic rollback for canary errors | Charlie | 2024-02-15 | 📋 Not Started | Auto-rollback at 0.5% |
| 9 | Create database query review checklist | Alice | 2024-01-20 | 📋 Not Started | Checklist in PR template |

### Long-term (Complete within 3 months)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 10 | Implement database query review process | Alice | 2024-03-15 | 📋 Not Started | All queries reviewed |
| 11 | Set up staging DB sync from production | Bob | 2024-03-30 | 📋 Not Started | Staging has 1M+ rows |
| 12 | Create SLO dashboard for payment service | Charlie | 2024-04-01 | 📋 Not Started | Dashboard live |

**Tracking:** All action items added to JIRA epic [ENG-5678]

---

## Related Incidents

**Similar past incidents:**
- INC-0987 (2023-11-20): Slow query on orders table (missing index)
- INC-0654 (2023-09-15): Checkout timeout (database connection pool exhaustion)

**Pattern:** Database performance issues not caught in staging due to small dataset.

**Meta action item:** Review all past database-related incidents for common patterns (owner: Alice, deadline: 2024-02-01)

---

## Appendix

### Evidence

**Logs:**
- [CloudWatch payment service errors](https://cloudwatch.link)
- [Database slow query log](https://db-log.link)

**Dashboards:**
- [Datadog payment service](https://datadog.link)
- [Grafana database performance](https://grafana.link)

**Code:**
- [PR #567: Payment optimization](https://github.com/internal)
- [Rollback PR #568](https://github.com/internal)

**Alerts:**
- [PagerDuty incident #5678](https://pd.link)

### Runbook Updates

Updated payment service runbook with:
1. Rollback procedure (verified to work)
2. Common error patterns (added query timeout)
3. Escalation path (confirmed correct)

### Team Discussion

RCA reviewed in team meeting on 2024-01-16:
- Team agreed with root cause analysis
- Action items prioritized
- Follow-up RCA review scheduled for 2024-02-15 (check action item progress)

**Key insight from discussion:**
"This is a process failure, not a people failure. Our staging environment doesn't match production, leading to false confidence."

---

**Document status:** Final
**Next review:** 2024-02-15 (30-day follow-up)
```

### Example 2: Race Condition RCA

```markdown
# Root Cause Analysis: Double Charge Incident

**Incident ID:** INC-1456
**Date:** 2024-01-20
**Severity:** SEV-2 (High)
**Duration:** Ongoing (12 affected transactions over 3 days)
**Author:** Bob Smith
**Reviewed by:** Engineering Team

---

## Executive Summary

Between January 17-20, 2024, 12 customers were charged twice for the same order due to a race condition in the payment processing code. The issue was intermittent and only occurred when users clicked "Pay" multiple times in quick succession. Total financial impact: ~$3,600 in duplicate charges (all refunded).

**Root cause:** No idempotency check in payment processing endpoint.

**Key action items:**
1. Add idempotency key to payment API by Jan 22
2. Add duplicate payment detection by Jan 23
3. Add client-side button debouncing by Jan 24

---

## Timeline (All times UTC)

**Discovery:**
- Jan 17: First customer report of double charge (support ticket #789)
- Jan 18: Second customer report (ticket #812)
- Jan 20: Engineering investigation begins after 3rd report (ticket #834)

**Resolution:**
- Jan 20 14:30: Issue identified (race condition)
- Jan 20 15:15: Hotfix deployed (idempotency key added)
- Jan 20 16:00: All affected customers refunded

| Date/Time | Event | Evidence | Notes |
|-----------|-------|----------|-------|
| Jan 17 09:23 | Customer A charged twice | Stripe logs | 2 charges, 500ms apart |
| Jan 17 10:15 | Support ticket #789 opened | Zendesk | Customer reports double charge |
| Jan 17 14:30 | Support issues refund | Stripe | Manual refund processed |
| Jan 18 11:45 | Customer B charged twice | Stripe logs | 2 charges, 300ms apart |
| Jan 18 12:00 | Support ticket #812 opened | Zendesk | Second duplicate charge report |
| Jan 19 16:20 | Customer C charged twice | Stripe logs | 2 charges, 450ms apart |
| Jan 20 09:00 | Support escalates to engineering | Slack #support | "3 duplicate charges this week" |
| Jan 20 10:30 | Bob investigates payment logs | CloudWatch | Sees pattern: 2 requests, <1s apart |
| Jan 20 11:15 | Bob identifies race condition | Code review | No idempotency check |
| Jan 20 14:30 | Hotfix PR #789 merged | GitHub | Add idempotency key |
| Jan 20 15:15 | Hotfix deployed to production | Jenkins | v2.5.3 |
| Jan 20 16:00 | All 12 customers refunded | Stripe | Total $3,600 refunded |

**Key metrics:**
- Time from first incident to detection: 3 days
- Number of affected customers: 12
- Total refunded: $3,600

---

## Impact

### User Impact
- Customers affected: 12
- Duplicate charges: 12 transactions
- Average duplicate charge: $300
- Support tickets: 12

### Revenue Impact
- Duplicate charges issued: $3,600
- All refunded: -$3,600
- **Net revenue impact: $0**
- Support costs: 12 tickets × $10 = $120
- Stripe transaction fees (non-refundable): $36
- **Total cost: $156**

### Reputation Impact
- 12 frustrated customers
- 2 negative tweets
- 1 customer churned

---

## Root Cause Analysis

### Trigger Event

Users clicking "Pay" button multiple times in quick succession (double-click or impatience).

### 5 Whys

1. **Why were customers charged twice?**
   → Because two payment requests were processed simultaneously

2. **Why were two requests processed?**
   → Because user clicked "Pay" button twice (within 500ms)

3. **Why did both requests succeed?**
   → Because there was no idempotency check to deduplicate concurrent requests

4. **Why was there no idempotency check?**
   → Because the original implementation assumed button would be disabled after click

5. **Why wasn't button disabled?**
   → Because button disable happens client-side after API call starts (race window)

### Root Cause

**No idempotency check in payment processing endpoint.**

The payment endpoint processes every request independently:
```typescript
// ❌ No idempotency check
app.post('/api/payment', async (req, res) => {
  const { orderId, amount } = req.body;

  // Process payment immediately
  const charge = await stripe.charges.create({
    amount,
    currency: 'usd',
    source: req.user.paymentMethod
  });

  res.json({ success: true, chargeId: charge.id });
});
```

If two requests arrive within ~500ms:
- Both start processing
- Both call Stripe API
- Both succeed
- Customer charged twice

### Contributing Factors

1. **No client-side debouncing**: Button can be clicked multiple times before disabled

2. **No UI feedback**: Users don't see "Processing..." state until after request starts

3. **No duplicate detection**: No database check for recent duplicate orders

4. **Late detection**: Took 3 days and 12 incidents before engineering investigation

---

## Detection Gaps

### Gap 1: No Duplicate Payment Monitoring

**Problem:** 12 duplicate charges occurred over 3 days before detection.

**Why didn't we notice?**
- No alert on duplicate charges
- No dashboard tracking duplicate orders
- Support tickets handled individually (no pattern recognition)

**Fix:**
Add monitoring for duplicate charges:
1. Alert: "Multiple charges for same order within 5 minutes"
2. Dashboard: "Duplicate charge rate" (should be ~0%)
3. Automated refund for detected duplicates

**Action items:**
- [ ] Add duplicate charge alert - Bob by Jan 22
- [ ] Create duplicate charge dashboard - Alice by Jan 25
- [ ] Implement auto-refund for duplicates - Charlie by Feb 1

### Gap 2: No Integration Test for Race Condition

**Problem:** Race condition not caught in testing.

**Why?**
- Unit tests mock payment API (no concurrency)
- Integration tests run serially (no concurrent requests)
- No load tests with concurrent users

**Fix:**
Add concurrency tests:
```typescript
it('prevents double charge on concurrent requests', async () => {
  const orderId = 'order-123';

  // Send two payment requests simultaneously
  const [charge1, charge2] = await Promise.all([
    processPayment(orderId),
    processPayment(orderId)
  ]);

  // Second request should fail (duplicate)
  expect(charge1.success).toBe(true);
  expect(charge2.success).toBe(false);
  expect(charge2.error).toBe('duplicate_payment');
});
```

**Action items:**
- [ ] Add race condition test to payment suite - Bob by Jan 23
- [ ] Add load test with concurrent users - Alice by Feb 8

---

## What Went Well

### 1. Fast Hotfix (5 hours from identification to deploy)

Once Bob identified the issue:
- Hotfix implemented in 3 hours ✅
- Code reviewed and merged in 1 hour ✅
- Deployed to production in 1 hour ✅

### 2. Proactive Refunds

Support team:
- Refunded all 12 customers proactively ✅
- Sent apology emails with explanation ✅
- Offered 10% discount on next order ✅

### 3. Customer Retention

Despite the issue:
- 11 of 12 customers retained ✅
- Positive responses to apology ✅
- Fast refund processing appreciated ✅

---

## Action Items

### Immediate (Complete within 1 week)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 1 | Add idempotency key to payment API | Bob | 2024-01-22 | ✅ Complete | Deployed in v2.5.3 |
| 2 | Add duplicate payment detection | Bob | 2024-01-23 | ⏳ In Progress | Check DB for recent order |
| 3 | Add client-side button debouncing | Alice | 2024-01-24 | ⏳ In Progress | Button disabled after click |
| 4 | Add alert: "Duplicate charges" | Bob | 2024-01-22 | 📋 Not Started | Alert on 2+ charges/order |
| 5 | Create duplicate charge dashboard | Alice | 2024-01-25 | 📋 Not Started | Dashboard in Datadog |

### Short-term (Complete within 1 month)

| # | Action | Owner | Deadline | Status | Verification |
|---|--------|-------|----------|--------|--------------|
| 6 | Add race condition test | Bob | 2024-01-23 | 📋 Not Started | Test passes |
| 7 | Implement auto-refund for duplicates | Charlie | 2024-02-01 | 📋 Not Started | Auto-refund within 1 hour |
| 8 | Add load test with concurrent users | Alice | 2024-02-08 | 📋 Not Started | Test 100 concurrent checkouts |

---

## Related Incidents

**None found.** This is the first race condition incident in payment processing.

---

## Appendix

### Evidence

**Stripe logs:**
- Customer A: [charge_1, charge_2] 500ms apart
- Customer B: [charge_1, charge_2] 300ms apart
- Customer C: [charge_1, charge_2] 450ms apart

**Code:**
- [Hotfix PR #789](https://github.com/internal)
- [Before: No idempotency](https://github.com/internal/blob/old)
- [After: With idempotency](https://github.com/internal/blob/new)

---

**Document status:** Final
**Next review:** 2024-02-20 (30-day follow-up)
```

## Summary

A good RCA:
1. **Timeline with exact timestamps** and evidence
2. **Root cause** (not just trigger) using 5 Whys
3. **Contributing factors** (what made it worse)
4. **Detection gaps** (why didn't we catch it sooner)
5. **What went well** (successes to preserve)
6. **Action items** (specific, owned, deadlined)
7. **Blame-free** (focus on systems, not people)

**Key principles:**
- Human error is never the root cause (always a system failure)
- Action items must be specific and verifiable
- Follow up on action items (30-day review)
- Learn from successes (what went well)
- Document evidence (logs, dashboards, code)

**The goal:** Prevent this class of incident from happening again.
