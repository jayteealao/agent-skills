# Quick Reference Guide

Fast lookup for all session-workflow plugin commands and workflows.

---

## Command Quick Lookup

### Security & Privacy (4 commands)

```bash
/review:security              # Security vulnerabilities
/review:api-contracts         # API backwards compatibility
/review:infra-security        # Infrastructure security (IAM, network)
/review:data-integrity        # Data consistency and integrity
```

### Performance (3 commands)

```bash
/review:frontend-performance  # Bundle size, rendering, data fetching
/review:backend-concurrency   # Race conditions, atomicity, locking
/review:migrations           # Database migration safety
```

### Accessibility (2 commands)

```bash
/review:accessibility         # WCAG 2.1 AA compliance
/review:frontend-accessibility # SPA-specific accessibility
```

### Architecture (2 commands)

```bash
/review:dx                    # Developer experience
/review:refactor-safety       # Semantic drift detection
```

### Infrastructure (3 commands)

```bash
/review:infra                 # Infrastructure (compute, network, availability)
/review:ci                    # CI/CD pipelines
/review:release               # Release engineering
```

### Observability (2 commands)

```bash
/review:logging               # Logging safety, privacy, quality
/review:observability         # Complete observability review
```

### User Experience (1 command)

```bash
/review:ux-copy              # UX copy clarity and consistency
```

### Incident Response (3 commands)

```bash
/repro-harness               # Bug reproduction harness
/rca                         # Root cause analysis (5 Whys)
/postmortem-actions          # Convert RCA to action items
```

### Risk & Planning (3 commands)

```bash
/risk-assess                 # Release risk assessment
/compat-check                # API/database/event compatibility
/test-matrix                 # Test strategy design
```

### Deployment (7 commands)

```bash
/ship-plan                   # Staged rollout planning
/prod-readiness              # Production readiness review
/telemetry-audit             # Telemetry PII/cost audit
/debt-register               # Technical debt backlog
/refactor-followups          # Staged refactor planning
/handoff                     # Handoff documentation
/close-session               # Session closure
```

### Setup (1 command)

```bash
/setup-wide-logging          # Implement wide-event observability
```

---

## Common Workflows

### Pre-Merge Code Review

```bash
# 1. Security check
/review:security TARGET:src/api/ DEPTH:thorough FOCUS:authentication,secrets

# 2. Performance check (if applicable)
/review:frontend-performance TARGET:src/components/ DEPTH:thorough FOCUS:bundle-size

# 3. Accessibility check (if UI changes)
/review:accessibility TARGET:src/components/ DEPTH:thorough FOCUS:keyboard,aria
```

---

### Pre-Deployment Checklist

```bash
# 1. Risk assessment
/risk-assess RELEASE:v2.5.0 CHANGES:payment-api,checkout ENVIRONMENT:production

# 2. Compatibility check
/compat-check CHANGE_TYPE:api,database OLD_VERSION:v2.4.0 NEW_VERSION:v2.5.0

# 3. Production readiness
/prod-readiness SERVICE:payment-api DEPLOYMENT_ENVIRONMENT:production READINESS_LEVEL:critical

# 4. Rollout plan
/ship-plan RELEASE:v2.5.0 ROLLOUT_STYLE:canary TRAFFIC_PATTERN:1,10,50,100

# 5. Handoff to oncall
/handoff AUDIENCE:oncall CHANGE:"Payment API v2" CRITICAL_PATHS:checkout ROLLBACK_PLAN:feature-flag
```

---

### Incident Response

```bash
# 1. Reproduce bug
/repro-harness BUG_REPORT:"Checkout timeout after 30s" TARGET:src/checkout/

# 2. Root cause analysis
/rca INCIDENT:"Checkout Timeout" DURATION:45min IMPACT:2500 users

# 3. Create action plan
/postmortem-actions RCA:<output> SCOPE:service PRIORITIZATION:balanced CAPACITY:medium
```

---

### Observability Setup

```bash
# 1. Implement wide-event logging
/setup-wide-logging FRAMEWORK:express LOGGER:pino TAIL_SAMPLE_RATE:0.05

# 2. Review logging
/review:logging TARGET:src/ DEPTH:thorough FOCUS:safety,privacy,noise

# 3. Complete observability review
/review:observability TARGET:src/ DEPTH:thorough FOCUS:logs,metrics,alerts
```

---

## Parameter Cheat Sheet

### Common Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `TARGET` | File/directory path | Code to review |
| `DEPTH` | `quick`, `thorough`, `paranoid` | Review thoroughness |
| `FOCUS` | Comma-separated areas | Specific focus areas |
| `FRAMEWORKS` | `express`, `react`, etc. | Technology stack |

### Severity Levels

| Level | When to Use | Example |
|-------|-------------|---------|
| `BLOCKER` | Must fix before merge | SQL injection vulnerability |
| `HIGH` | Fix before release | Missing index causing slowdown |
| `MEDIUM` | Fix in follow-up | Suboptimal algorithm |
| `LOW` | Nice-to-have | Minor refactoring opportunity |
| `NIT` | Style/convention | Inconsistent naming |

### Review Depths

| Depth | Time | When to Use |
|-------|------|-------------|
| `quick` | 30min | Pre-merge quick scan |
| `thorough` | 2h | Standard PR review |
| `paranoid` | 1 day | Critical production code |

---

## Wide-Event Observability Quick Start

### 1. Define Event Schema

```typescript
interface WideEvent {
  timestamp: string;
  request_id: string;
  service: string;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  user: { id: string; subscription: string; ltv: number };
  feature_flags: Record<string, boolean>;
  outcome: 'success' | 'error';
}
```

### 2. Implement Tail Sampling

```typescript
function shouldSample(event: WideEvent): boolean {
  if (event.status_code >= 400) return true;  // Errors
  if (event.duration_ms > 2000) return true;  // Slow
  if (event.user?.subscription === 'enterprise') return true;  // VIPs
  return Math.random() < 0.05;  // 5% sample
}
```

### 3. Add Middleware

```typescript
app.use((req, res, next) => {
  const event: WideEvent = { /* ... */ };
  res.on('finish', () => {
    if (shouldSample(event)) {
      logger.info(event, 'request_complete');
    }
  });
  next();
});
```

### 4. Query Logs (CloudWatch Insights)

```sql
-- Error rate by subscription tier
fields user.subscription, count(*) as total
| filter outcome = 'error'
| stats count() by user.subscription

-- Slow requests
fields @timestamp, duration_ms, path, user.id
| filter duration_ms > 2000
| sort duration_ms desc
| limit 20
```

---

## Priority Matrix

### Impact × Effort → Priority

| Impact / Effort | Small (S) | Medium (M) | Large (L) |
|-----------------|-----------|------------|-----------|
| **High** | P0 | P0 | P1 |
| **Medium** | P1 | P1 | P2 |
| **Low** | P2 | P2 | P3 |

**P0**: Do immediately (< 1 week)
**P1**: Do soon (< 1 month)
**P2**: Do eventually (< 1 quarter)
**P3**: Maybe never (backlog)

---

## Rollout Strategies

### Canary (Recommended for High-Risk Changes)

```
1% → 10% → 50% → 100%
30min  1h     2h     24h hold
```

**Success criteria per phase**:
- Error rate < baseline + 0.1%
- P95 latency < baseline + 10%
- No customer complaints

**Automatic rollback triggers**:
- Error rate > 1% for 5 minutes
- P95 latency > 2x baseline for 10 minutes

### Blue-Green (Recommended for Database Migrations)

```
Blue (old) ← 100% traffic
Green (new) ← 0% traffic
[Deploy Green, warm up]
Green (new) ← 100% traffic
Blue (old) ← keep for 24h (rollback safety)
```

### Rolling (Recommended for Low-Risk Changes)

```
Instance 1: Deploy
Instance 2: Deploy
Instance 3: Deploy
Instance 4: Deploy
[25% → 50% → 75% → 100% over 30 minutes]
```

---

## Session Management

### Start Session

```bash
mkdir -p .claude/<session-slug>
cat > .claude/<session-slug>/README.md << 'EOF'
# Session: <Title>
**Started**: $(date +%Y-%m-%d)
**Status**: In Progress
## Goals
- Goal 1
- Goal 2
EOF
```

### During Session

Update README with progress:
```markdown
## Progress
### 2025-01-15
- ✅ Completed X
- 🚧 In progress Y
- ⏸️ Blocked on Z
```

### Before PR

```bash
/handoff AUDIENCE:reviewers CHANGE:"..." CRITICAL_PATHS:...
# Paste output in PR description
```

### After Completion

```bash
/close-session SESSION_SLUG:my-session STATUS:Done OUTCOME:"..." PR_OR_COMMIT:... ARTIFACTS_COMPLETED:...
```

---

## Keyboard Shortcuts for Common Commands

Save these as shell aliases:

```bash
# ~/.bashrc or ~/.zshrc

alias crs='/review:security'
alias crp='/review:frontend-performance'
alias cra='/review:accessibility'
alias cro='/review:observability'

alias risk='/risk-assess'
alias ship='/ship-plan'
alias ready='/prod-readiness'
alias handoff='/handoff'
alias close='/close-session'
```

Usage:
```bash
claude crs TARGET:src/api/ DEPTH:thorough FOCUS:authentication
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Session Workflow Checks
on: [pull_request]

jobs:
  security-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Security Review
        run: |
          claude /review:security \
            TARGET:src/ \
            DEPTH:thorough \
            FOCUS:authentication,secrets \
            > security-review.md
      - name: Upload Report
        uses: actions/upload-artifact@v2
        with:
          name: security-review
          path: security-review.md

  performance-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Frontend Performance Review
        run: |
          claude /review:frontend-performance \
            TARGET:src/components/ \
            DEPTH:quick \
            FOCUS:bundle-size \
            > performance-review.md
      - name: Comment on PR
        uses: actions/github-script@v6
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('performance-review.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: report
            });
```

---

## Alerting Best Practices

### SLI-Based Alerts

```typescript
// Error rate alert
error_rate = (errors / total_requests) * 100
alert: error_rate > 1% for 5 minutes

// Latency alert
p95_latency = p95(duration_ms)
alert: p95_latency > 2000ms for 10 minutes

// Business metric alert
gmv_per_minute = sum(cart.total_cents) / 100
alert: gmv_per_minute < baseline * 0.9 for 15 minutes
```

### Alert Severity Levels

| Severity | Response Time | Example |
|----------|---------------|---------|
| **P0** | Immediate page | Payment API down |
| **P1** | 30 minutes | Error rate 5% |
| **P2** | Next business day | Slow query detected |
| **P3** | Weekly review | Low disk space warning |

---

## Cost Optimization

### Logging Cost Reduction

| Strategy | Savings | Signal Loss |
|----------|---------|-------------|
| Tail sampling (5%) | 90% | 0% (keep all errors/slow/VIPs) |
| Reduce log retention (90d → 30d) | 67% | Historical analysis limited |
| Filter debug logs in prod | 50% | Debug info lost |
| **Recommended: Tail sampling** | **90%** | **0%** |

### Metric Cardinality Limits

| Cardinality | Cost | Example |
|-------------|------|---------|
| < 100 | Low | HTTP status codes |
| 100-1,000 | Medium | API endpoints |
| 1,000-10,000 | High | User IDs (sample!) |
| > 10,000 | Extreme | Request IDs (don't use!) |

**Rule**: Never use unbounded dimensions (request_id, trace_id) as metric labels

---

## Troubleshooting

### "Command not found: /review:security"

**Solution**: Plugin not installed or not loaded
```bash
claude reload
claude commands | grep review
```

### "No findings generated"

**Solution**: TARGET path doesn't exist or empty
```bash
ls -la <TARGET>
# Verify files exist in target
```

### "Wide-event logs not appearing"

**Solution**: Check sampling function
```bash
# Temporarily disable sampling for testing
return true;  // Keep 100% of logs
```

### "Queries timing out in CloudWatch"

**Solution**: Add indexes or reduce time range
```sql
-- Add filter early to reduce scan
| filter service = 'api'  # ← Add this first
| filter @timestamp > @timestamp - 1h  # ← Narrow time range
| filter path = '/api/checkout'
```

---

## Resources

- **Documentation**: [Full docs](README.md)
- **Examples**: [Real-world examples](examples/)
- **Skills**: [Wide-event observability](../skills/wide-event-observability.md)
- **Commands**: [Complete reference](commands.md)
- **Workflows**: [End-to-end workflows](workflows.md)

---

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/session-workflow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/session-workflow/discussions)

---

**Last Updated**: 2026-01-15
