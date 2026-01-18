# Session Workflow Plugin

**Version**: 1.8.0
**Author**: Claude Code Community
**License**: MIT

A hobbyist-focused Claude Code plugin providing 46 commands, 5 research agents, and 1 skill for software engineering workflows. Uses complexity metrics (LOC, files touched, dependencies) instead of time estimates. Single developer perspective with no organizational role concepts. Features minimal specifications (spec.md), extensively researched plans (plan.md) with web-validated dependencies and security checks, and comprehensive code review coverage.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Command Categories](#command-categories)
- [Skills](#skills)
- [Workflows](#workflows)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## 🎯 Overview

The Session Workflow Plugin provides a complete toolkit for software engineers to maintain high code quality, operational excellence, and effective incident response. Built on real-world production patterns from Node.js/TypeScript/React ecosystems.

### What's Included

**46 Commands** (hobby-focused, simplified outputs):
- 30 code review commands (security, performance, accessibility, maintainability, etc.)
- 9 workflow commands (session management, spec generation, planning, documentation)
- 3 deployment commands (compatibility checking, test planning, production readiness)
- 2 operations commands (technical debt tracking, refactor planning)
- 1 incident response command (bug reproduction)
- 1 setup command (observability infrastructure)

**1 Skill**:
- Wide-event observability design based on industry best practices

### Key Features

✅ **Comprehensive Code Review** - 30 specialized review commands with detailed checklists
✅ **Operational Excellence** - Bug reproduction, RCA, risk assessment, deployment planning
✅ **Wide-Event Observability** - Modern logging with tail sampling (90% cost reduction)
✅ **Incident Response** - Postmortem actions, runbooks, production readiness
✅ **Session Management** - Handoff documentation, session closure with tracking
✅ **Real Production Examples** - 3-5 detailed examples per command with before/after code
✅ **Multiple Frameworks** - Express, Fastify, Koa, React, Vue, Angular support

---

## 📦 Installation

### Method 1: Clone Plugin Repository

```bash
# Navigate to your Claude Code plugins directory
cd ~/.claude/plugins  # or %USERPROFILE%\.claude\plugins on Windows

# Clone this plugin
git clone https://github.com/yourusername/session-workflow.git

# Reload Claude Code
claude reload
```

### Method 2: Manual Installation

```bash
# Create plugin directory
mkdir -p ~/.claude/plugins/session-workflow

# Copy plugin files
cp -r session-workflow/* ~/.claude/plugins/session-workflow/

# Reload Claude Code
claude reload
```

### Verify Installation

```bash
# List available commands
claude commands | grep review

# You should see commands like:
# /review:security
# /review:performance
# /review:accessibility
# ... (30 total review commands)
```

---

## 🚀 Quick Start

### 1. Code Review Workflow

Review code for security issues:

```bash
claude /review:security
TARGET: src/api/
DEPTH: thorough
FOCUS: authentication,authorization,secrets
```

Review frontend performance:

```bash
claude /review:frontend-performance
TARGET: src/components/
FRAMEWORKS: react,webpack
FOCUS: bundle-size,rendering
```

### 2. Observability Setup

Set up wide-event logging:

```bash
claude /setup-wide-logging
FRAMEWORK: express
LOGGER: pino
TAIL_SAMPLE_RATE: 0.05
BUSINESS_CONTEXT: user,subscription,cart
```

Review existing logging:

```bash
claude /review:logging
TARGET: src/
FOCUS: safety,privacy,noise
```

### 3. Incident Response

Create reproduction harness for bug:

```bash
claude /repro-harness
BUG_REPORT: "Users report checkout timeout after 30s"
TARGET: src/checkout/
FRAMEWORKS: express,stripe
```

Perform root cause analysis:

```bash
claude /rca
INCIDENT: "2025-01-15 Checkout Timeout Incident"
DURATION: 45min
IMPACT: 2500 users affected
```

Convert RCA to action items:

```bash
claude /postmortem-actions
RCA: <paste /rca output>
SCOPE: service
PRIORITIZATION: balanced
CAPACITY: medium
```

### 4. Deployment Planning

Assess release risk:

```bash
claude /risk-assess
RELEASE: v2.5.0
CHANGES: payment-api-v2,new-checkout-flow
ENVIRONMENT: production
```

Create rollout plan:

```bash
claude /ship-plan
RELEASE: v2.5.0
ROLLOUT_STYLE: canary
TRAFFIC_PATTERN: 1,10,50,100
FEATURE_FLAGS: new_checkout_flow
```

### 5. Session Management

Create handoff documentation:

```bash
claude /handoff
CHANGE: "Payment API v2 migration"
CRITICAL_PATHS: checkout,subscriptions
ROLLBACK_PLAN: feature-flag
```

Close work session:

```bash
claude /close-session
SESSION_SLUG: payment-api-v2
STATUS: Done
OUTCOME: "Completed payment API migration with 95% test coverage"
PR_OR_COMMIT: https://github.com/org/repo/pull/456
```

---

## 📚 Command Categories

### Code Review Commands (30 total)

#### Security & Privacy
- `/review:security` - Security vulnerabilities (auth, secrets, injection)
- `/review:api-contracts` - API contract stability and versioning
- `/review:infra-security` - Infrastructure security (IAM, network, secrets)
- `/review:data-integrity` - Data consistency and integrity

#### Performance
- `/review:frontend-performance` - Bundle size, rendering, data fetching
- `/review:backend-concurrency` - Race conditions, atomicity, locking
- `/review:migrations` - Database migration safety

#### Accessibility
- `/review:accessibility` - WCAG 2.1 AA compliance
- `/review:frontend-accessibility` - Frontend-specific accessibility for SPAs

#### Architecture & Design
- `/review:dx` - Developer experience and API ergonomics
- `/review:refactor-safety` - Semantic drift detection in refactors

#### Infrastructure & Operations
- `/review:infra` - Infrastructure (IAM, network, compute, availability)
- `/review:ci` - CI/CD pipelines (correctness, determinism, caching)
- `/review:release` - Release engineering (versioning, changelog, rollout)

#### Observability
- `/review:logging` - Logging safety, privacy, quality, noise
- `/review:observability` - Logs, metrics, tracing, error reporting, alerts

#### User Experience
- `/review:ux-copy` - UX copy clarity, actionability, consistency, tone

**...and 13 more specialized review commands**

### Operational Commands (10 total)

#### Incident Response
- `/repro-harness` - Bug reproduction with deterministic tests
- `/rca` - Root cause analysis with 5 Whys methodology
- `/postmortem-actions` - Convert RCA to trackable action items

#### Risk & Planning
- `/risk-assess` - Release risk assessment with impact × likelihood
- `/compat-check` - API/database/event compatibility checking
- `/test-matrix` - Behavior-driven test strategy design

#### Deployment & Operations
- `/ship-plan` - Staged rollout planning (canary/blue-green)
- `/prod-readiness` - Production readiness "2am debug story" review
- `/telemetry-audit` - Telemetry PII/cardinality/cost audit
- `/debt-register` - Technical debt backlog with priority matrix
- `/refactor-followups` - Staged refactor planning

### Workflow Commands (3 total)

- `/handoff` - Documentation for others reviewing, deploying, or maintaining your changes
- `/close-session` - Session closure with artifact tracking
- `/postmortem-actions` - Convert incident findings to action items

### Setup Commands (1 total)

- `/setup-wide-logging` - Implement wide-event observability

---

## 🎓 Skills

### Wide-Event Observability

**Skill**: `wide-event-observability`

**Purpose**: Design and implement wide-event logging with tail sampling for cost-effective, queryable observability.

**Philosophy** (from loggingsucks.com):
- **ONE event per request** with complete business context
- **Tail sampling**: Keep 100% of errors/slow/VIPs, sample 5% of normal
- **90% cost reduction** while maintaining 100% of signal
- **Shift from grep → SQL** queries in CloudWatch/Datadog/Elastic

**Key Concepts**:

```typescript
interface WideEvent {
  // Correlation
  timestamp: string;
  request_id: string;
  trace_id?: string;

  // Service Context
  service: string;
  version: string;
  deployment_id: string;

  // Request Details
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;

  // Business Context (HIGH VALUE)
  user: {
    id: string;
    subscription: 'free' | 'premium' | 'enterprise';
    lifetime_value_cents: number;
  };

  // Feature Flags
  feature_flags: Record<string, boolean>;

  // Error Details
  error?: {
    type: string;
    code: string;
    message: string;
    retriable: boolean;
  };
}

// Tail Sampling Decision
function shouldSample(event: WideEvent): boolean {
  if (event.status_code >= 500) return true;  // Keep errors
  if (event.duration_ms > 2000) return true;  // Keep slow
  if (event.user?.subscription === 'enterprise') return true;  // Keep VIPs
  if (event.feature_flags?.new_checkout_flow) return true;  // Keep flagged
  return Math.random() < 0.05;  // Sample 5% of rest
}
```

**When to Use**:
- Designing new logging systems
- Migrating from traditional scattered logs
- Reducing logging costs while improving signal
- Building queryable observability

**Usage**:
```bash
claude --skill wide-event-observability "Design logging for payment API"
```

---

## 🔄 Workflows

### Complete Code Review Workflow

```
1. Choose Review Type
   ├─ Security issues? → /review:security
   ├─ Performance problems? → /review:frontend-performance or /review:backend-concurrency
   ├─ Accessibility gaps? → /review:accessibility
   ├─ Infrastructure changes? → /review:infra
   └─ Observability concerns? → /review:logging or /review:observability

2. Run Review Command
   - Provide TARGET (file/directory)
   - Set DEPTH (quick|thorough|paranoid)
   - Specify FOCUS areas

3. Review Findings
   - BLOCKER: Must fix before merge
   - HIGH: Fix before release
   - MEDIUM: Fix in follow-up PR
   - LOW: Nice-to-have improvement
   - NIT: Style/convention suggestion

4. Create Fix PRs
   - Address BLOCKER and HIGH findings
   - Document MEDIUM/LOW in technical debt register
   - Update code review checklist
```

### Complete Incident Response Workflow

```
1. Reproduce Bug
   /repro-harness
   ├─ Create minimal reproduction
   ├─ Add deterministic test
   └─ Document steps

2. Root Cause Analysis
   /rca
   ├─ Timeline of events
   ├─ 5 Whys analysis
   ├─ Contributing factors
   └─ Blast radius assessment

3. Create Action Plan
   /postmortem-actions
   ├─ Prevention actions (guardrails)
   ├─ Detection actions (alerts)
   ├─ Response actions (runbooks)
   ├─ Process actions (CI checks)
   └─ Prioritize by impact × effort

4. Track Follow-ups
   - Create JIRA/Linear tickets
   - Assign owners and due dates
   - Schedule follow-up reviews
   - Measure MTTR improvement
```

### Complete Deployment Workflow

```
1. Risk Assessment
   /risk-assess
   ├─ Identify high-risk changes
   ├─ Calculate risk score
   └─ Recommend mitigation

2. Compatibility Check
   /compat-check
   ├─ API compatibility
   ├─ Database migrations
   ├─ Event schema changes
   └─ Dependency updates

3. Test Strategy
   /test-matrix
   ├─ Unit tests
   ├─ Integration tests
   ├─ E2E tests
   └─ Chaos tests

4. Production Readiness
   /prod-readiness
   ├─ "2am debug story" test
   ├─ Monitoring coverage
   ├─ Runbook validation
   └─ Rollback procedure

5. Rollout Plan
   /ship-plan
   ├─ Canary: 1% → 10% → 50% → 100%
   ├─ Success criteria per phase
   ├─ Automatic rollback triggers
   └─ Feature flag strategy

6. Telemetry Audit
   /telemetry-audit
   ├─ Verify no PII exposure
   ├─ Check metric cardinality
   └─ Assess cost impact

7. Documentation
   /handoff
   ├─ Where to start reviewing
   ├─ How to test and deploy
   ├─ Monitoring and rollback procedures
   └─ Known risks and complexity
```

### Complete Observability Setup Workflow

```
1. Learn Philosophy
   Use skill: wide-event-observability
   ├─ Understand wide events
   ├─ Learn tail sampling
   └─ Design business context

2. Implement Logging
   /setup-wide-logging
   ├─ Auto-detect framework (Express/Fastify/Koa)
   ├─ Add middleware
   ├─ Configure tail sampling
   └─ Add business context

3. Review Implementation
   /review:logging
   ├─ Safety: No secrets in logs
   ├─ Privacy: PII redaction
   ├─ Quality: Structured events
   ├─ Noise: Tail sampling working
   └─ Structure: Queryable format

4. Complete Observability
   /review:observability
   ├─ Logs: Wide events deployed
   ├─ Metrics: Key business metrics
   ├─ Tracing: Distributed tracing
   ├─ Error reporting: Sentry/Rollbar
   ├─ Alertability: Alerts on SLIs
   └─ Runbooks: Linked from alerts
```

### Session Management Workflow

```
1. Start Session
   - Create .claude/<session-slug>/ directory
   - Document goals in README.md
   - Track artifacts as you work

2. Crystallize Specification
   /spec-crystallize
   ├─ Convert ambiguous request into minimal spec
   ├─ 10-round interview (5 pre-research + 5 post-research)
   ├─ Output: .claude/<session-slug>/spec.md (1,000-1,500 words)
   └─ Focus on WHAT to build (requirements, acceptance criteria)

3. Create Research-Based Plan
   /research-plan
   ├─ Spawn ALL 5 research agents in parallel:
   │  • codebase-mapper (find reusable components, patterns)
   │  • web-research (libraries, security, OWASP, CVE checks)
   │  • design-options (synthesize approaches with trade-offs)
   │  • risk-analyzer (identify risks with mitigations)
   │  • edge-case-generator (comprehensive edge cases)
   ├─ Synthesize findings into cohesive plan
   ├─ Justify EVERY dependency (2-3 alternatives comparison)
   ├─ Self-review for errors, edge cases, overengineering
   ├─ Output: .claude/<session-slug>/plan.md
   └─ Focus on HOW to build (implementation steps, dependencies)

4. During Implementation
   - Update session README with progress
   - Document technical decisions
   - Track blockers and follow-ups
   - Run code reviews (/review:security, /review:performance, etc.)

5. Create Documentation
   /handoff
   ├─ Document critical paths and where to start
   ├─ Provide deployment steps and testing
   ├─ Document rollback procedure
   └─ Include complexity indicators (LOC, files, risks)

6. Close Session
   /close-session
   ├─ Set STATUS (Done/Paused/Abandoned)
   ├─ Summarize OUTCOME (1-3 sentences)
   ├─ Link PR_OR_COMMIT
   ├─ List ARTIFACTS_COMPLETED
   ├─ Document FOLLOW_UPS
   └─ Updates both session README and global index
```

---

## 📖 Documentation

Comprehensive documentation is available in the `/docs` directory:

### Core Documentation

- **[Complete Command Reference](docs/commands.md)** - All 43 commands with parameters and examples
- **[Workflow Guide](docs/workflows.md)** - End-to-end workflows for common scenarios
- **[Skills Guide](docs/skills.md)** - Wide-event observability skill documentation
- **[Integration Guide](docs/integration.md)** - Integrate with your development workflow

### Category-Specific Guides

- **[Code Review Guide](docs/code-review.md)** - How to use all 30 review commands effectively
- **[Incident Response Guide](docs/incident-response.md)** - Bug reproduction, RCA, postmortem actions
- **[Deployment Guide](docs/deployment.md)** - Risk assessment, compatibility, rollout planning
- **[Observability Guide](docs/observability.md)** - Wide-event logging, monitoring, alerting

### Advanced Topics

- **[Customization Guide](docs/customization.md)** - Customize commands for your tech stack
- **[Best Practices](docs/best-practices.md)** - Patterns and anti-patterns
- **[Examples](docs/examples.md)** - Real-world usage examples
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

---

## 🎯 Use Cases

### Development & Code Quality

- **Code Review**: Get detailed security, performance, and accessibility feedback
- **Bug Fixes**: Create reproduction harnesses and validate fixes
- **Refactoring**: Ensure semantic safety during refactors
- **Learning**: Understand best practices through detailed examples

### Planning & Architecture

- **Risk Assessment**: Evaluate release risks before deployment
- **Technical Debt**: Maintain prioritized debt register
- **Architecture Review**: Validate design decisions
- **Design Decisions**: Document architectural choices and trade-offs

### Operations & Reliability

- **Incident Response**: Structured debugging and action planning
- **Runbooks**: Create operational documentation
- **Production Readiness**: Validate services before production
- **Observability**: Design effective monitoring and alerting

### Documentation & Knowledge

- **Documentation**: Create clear notes for others (or future you)
- **Session Tracking**: Track work sessions and artifacts
- **Project Updates**: Document progress and share status
- **Quality Standards**: Establish code review guidelines

---

## 🏗️ Architecture

### Plugin Structure

```
session-workflow/
├── README.md                          # This file
├── plugin.json                        # Plugin metadata
├── docs/                              # Documentation
│   ├── commands.md                    # Command reference
│   ├── workflows.md                   # Workflow guides
│   ├── skills.md                      # Skills documentation
│   ├── integration.md                 # Integration guide
│   ├── code-review.md                 # Code review guide
│   ├── incident-response.md           # Incident response guide
│   ├── deployment.md                  # Deployment guide
│   ├── observability.md               # Observability guide
│   ├── best-practices.md              # Best practices
│   ├── examples.md                    # Real-world examples
│   └── troubleshooting.md             # Troubleshooting
├── skills/
│   └── wide-event-observability.md    # Observability skill
├── commands/
│   ├── setup-wide-logging.md          # Setup command
│   ├── handoff.md                     # Handoff workflow
│   ├── close-session.md               # Session closure
│   ├── repro-harness.md               # Bug reproduction
│   ├── rca.md                         # Root cause analysis
│   ├── postmortem-actions.md          # Postmortem actions
│   ├── risk-assess.md                 # Risk assessment
│   ├── compat-check.md                # Compatibility check
│   ├── test-matrix.md                 # Test strategy
│   ├── ship-plan.md                   # Rollout planning
│   ├── prod-readiness.md              # Production readiness
│   ├── telemetry-audit.md             # Telemetry audit
│   ├── debt-register.md               # Technical debt
│   ├── refactor-followups.md          # Refactor planning
│   └── review/                        # Review commands
│       ├── security.md
│       ├── accessibility.md
│       ├── frontend-performance.md
│       ├── backend-concurrency.md
│       ├── infra.md
│       ├── infra-security.md
│       ├── ci.md
│       ├── release.md
│       ├── ux-copy.md
│       ├── logging.md
│       ├── observability.md
│       ├── api-contracts.md
│       ├── migrations.md
│       ├── data-integrity.md
│       ├── dx.md
│       ├── refactor-safety.md
│       ├── frontend-accessibility.md
│       └── ... (30 total)
└── examples/                          # Example usage
    ├── code-review-workflow.md
    ├── incident-response-workflow.md
    ├── deployment-workflow.md
    └── observability-setup.md
```

### Command Design Principles

All commands follow consistent patterns:

1. **YAML Frontmatter** - Metadata (description, color)
2. **Parameter Guide** - Clear input specifications
3. **10-Step Workflow** - Systematic execution steps
4. **Category Checklists** - 4-7 categories with actionable items
5. **Detailed Examples** - 3-5 real-world findings with before/after code
6. **Severity Guidelines** - BLOCKER/HIGH/MED/LOW/NIT classification
7. **Validation** - How to verify fixes
8. **Output Template** - Structured markdown output

**Example Command Structure**:
```markdown
---
description: "Brief description"
color: "red|blue|green|yellow|purple"
---

# /command-name

## Parameter Guide
## Workflow (10 steps)
## Category Checklists
## Example Findings (3-5)
## Output Template
```

---

## 🔧 Configuration

### Global Configuration

Create `.claude/session-workflow.config.yaml` to customize plugin behavior:

```yaml
# Code Review Defaults
code_review:
  default_depth: thorough
  severity_threshold: HIGH
  frameworks:
    - express
    - react
    - typescript

# Observability Defaults
observability:
  default_logger: pino
  tail_sample_rate: 0.05
  business_context:
    - user.id
    - user.subscription
    - user.lifetime_value_cents

# Incident Response Defaults
incident_response:
  rca_method: five-whys
  action_prioritization: balanced
  tracking_system: jira

# Deployment Defaults
deployment:
  rollout_style: canary
  traffic_pattern: [1, 10, 50, 100]
  rollback_threshold: 0.01  # 1% error rate

# Session Management
session:
  session_dir: .claude
  auto_close: false
  require_pr_link: true
```

### Per-Project Configuration

Create `.session-workflow.local.yaml` in project root:

```yaml
# Override plugin defaults for this project
code_review:
  frameworks:
    - fastify  # Use Fastify instead of Express
    - vue      # Use Vue instead of React

observability:
  default_logger: winston  # Use Winston instead of Pino

deployment:
  rollout_style: blue-green  # Use blue-green instead of canary
```

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Adding New Commands

1. Create command file in `commands/` or `commands/review/`
2. Follow standard command structure (YAML frontmatter + 10-step workflow)
3. Include 3-5 detailed examples with before/after code
4. Add to command reference in `docs/commands.md`
5. Submit PR with description

### Adding New Skills

1. Create skill file in `skills/`
2. Document philosophy and key concepts
3. Provide usage examples
4. Add to skills guide in `docs/skills.md`
5. Submit PR with description

### Improving Documentation

1. Identify gaps or unclear sections
2. Add examples, clarifications, or corrections
3. Update relevant docs in `docs/`
4. Submit PR with description

---

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **loggingsucks.com** - Inspiration for wide-event observability philosophy
- **WCAG 2.1** - Accessibility guidelines and standards
- **OWASP Top 10** - Security vulnerability patterns
- **Site Reliability Engineering** - Google SRE practices
- **Incident Response** - PagerDuty, Atlassian incident management patterns

---

## 📬 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/session-workflow/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/session-workflow/discussions)
- **Documentation**: [Full Documentation](docs/)
- **Examples**: [Real-World Examples](examples/)

---

## 🗺️ Roadmap

### v1.1.0 (Q2 2026)
- [ ] Add `/review:mobile` for iOS/Android review
- [ ] Add `/review:database` for schema design review
- [ ] Add `/chaos-test` for chaos engineering
- [ ] Support for Python/Django/Flask frameworks
- [ ] Support for Go/Gin frameworks

### v1.2.0 (Q3 2026)
- [ ] GitHub Actions integration
- [ ] GitLab CI integration
- [ ] Slack notifications for critical findings
- [ ] PagerDuty integration for incidents
- [ ] Datadog dashboard templates

### v2.0.0 (Q4 2026)
- [ ] Machine learning for severity prediction
- [ ] Automated fix suggestions
- [ ] Historical trend analysis
- [ ] Project metrics dashboard
- [ ] Custom command templates

---

**Built with ❤️ by the Claude Code community**
