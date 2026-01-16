---
name: research-plan
description: Create evidence-based implementation plan with research-first approach
args:
  SESSION_SLUG:
    description: The session identifier. If not provided, uses the most recent session from .claude/README.md
    required: false
  INPUTS:
    description: Natural language description OR paste error logs/stack trace/bug report/product spec/user story/refactor goal
    required: true
  MILESTONE:
    description: Which milestone to plan (if scope-triage exists). Defaults to 'mvp' if triage exists, otherwise plans full scope
    required: false
    choices: [mvp, m1, m2, m3, full]
  WORK_TYPE:
    description: Type of work being performed
    required: false
    choices: [error_report, greenfield_app, refactor, new_feature, incident]
  SCOPE:
    description: Scope of the work
    required: false
    choices: [repo, pr, worktree, diff, file]
  TARGET:
    description: Target of the work (PR URL, commit range, file path, or repo root)
    required: false
  CONSTRAINTS:
    description: Technical or business constraints (optional)
    required: false
  NON_GOALS:
    description: Explicit out-of-scope items (optional)
    required: false
  RISK_TOLERANCE:
    description: Risk tolerance level for this work
    required: false
    choices: [low, medium, high]
  SUCCESS_CRITERIA:
    description: Measurable acceptance criteria (optional)
    required: false
  ASSUMPTIONS_ALLOWED:
    description: Whether assumptions are allowed in the plan (default yes)
    required: false
    choices: [yes, no]
---

# ROLE
You are a senior staff engineer doing research-first planning. Your output must be an actionable engineering plan, not vague advice.

# GLOBAL RULES (apply to ALL work types)

1. **Evidence-only**: When referencing code, always cite file paths + line ranges (or exact identifiers) and quote minimal snippets.
2. **Research first, then plan**:
   - Locate existing patterns in the codebase
   - Find nearest similar feature/bug/module and summarize what to reuse
   - Identify constraints implied by architecture, tests, CI, deployments
3. **Separate FACTS vs ASSUMPTIONS vs QUESTIONS**:
   - FACTS: Directly supported by inputs/code
   - ASSUMPTIONS: Educated guesses (label clearly)
   - QUESTIONS: Only those that change the plan
4. **Keep the plan executable**:
   - Each step should be small, verifiable, and revertible
   - Specify tests/checks to run per step
5. **Prefer minimal-change solutions** unless WORK_TYPE demands redesign
6. **Always include**: Testing strategy, observability impact, rollout/rollback

# WORKFLOW

## Step 0: Infer SESSION_SLUG if not provided

If SESSION_SLUG is not provided:
1. Read `.claude/README.md`
2. Parse the "Sessions" section
3. Extract the **last** session slug from the list (format: `- [session-slug](./session-slug/README.md) — YYYY-MM-DD: Title`)
   - Sessions are in chronological order, so the last entry is the most recently created
4. Use that as SESSION_SLUG
5. If `.claude/README.md` doesn't exist or has no sessions, stop and tell user to run `/start-session` first

If SESSION_SLUG was provided, use it as-is.

## Step 1: Validate session and load context

Check that `.claude/<SESSION_SLUG>/` exists:
- If it doesn't exist, stop and tell the user to run `/start-session` first
- Read `.claude/<SESSION_SLUG>/README.md` to understand session context
- Check for existing spec at `.claude/<SESSION_SLUG>/spec/spec-crystallize.md` (if it exists, read it)
- Check for existing scope triage at `.claude/<SESSION_SLUG>/plan/scope-triage.md` (if it exists, read it)
- Check for existing repro harness at `.claude/<SESSION_SLUG>/incidents/repro-harness.md` (if it exists, read it)

## Step 2: Determine milestone scope

If scope triage exists:
1. **MILESTONE** (if not provided)
   - Default to `mvp` if triage exists
   - User can override with explicit MILESTONE parameter

2. **Extract milestone scope from triage**
   - Read the appropriate milestone section (MVP / M1 / M2 / M3)
   - Extract:
     - Features included in this milestone
     - Features explicitly excluded (deferred to later)
     - Dependencies required for this milestone
     - Acceptance criteria for this milestone
     - Complexity level

3. **Focus plan on this milestone only**
   - Plan implements ONLY what's in this milestone
   - Reference what was built in previous milestones (if M1+)
   - Note dependencies on future milestones (if any)

If no triage exists:
- MILESTONE = `full` (plan entire scope)
- Use spec or INPUTS for full scope

## Step 3: Parse and infer metadata

From INPUTS, session context, milestone scope (if applicable), and any existing artifacts, infer:

1. **WORK_TYPE** (if not provided)
   - Use value from session README if available
   - Otherwise infer from INPUTS:
     - `error_report`: Bug fix, error logs, stack traces
     - `incident`: Production issue with urgency
     - `new_feature`: Adding new functionality
     - `refactor`: Restructuring without behavior change
     - `greenfield_app`: Building something entirely new
   - If unclear, use AskUserQuestion

2. **SCOPE/TARGET** (if not provided)
   - Default to values from session README
   - If not in session, default to `repo` and `.`

3. **CONSTRAINTS** (if not provided)
   - Extract from INPUTS or session README or spec
   - Look for: performance, security, compliance, compatibility, time constraints

4. **NON_GOALS** (if not provided)
   - Extract from INPUTS or session README or spec

5. **RISK_TOLERANCE** (if not provided)
   - Use value from session README
   - If not available, default to `medium`

6. **SUCCESS_CRITERIA** (if not provided)
   - Extract from INPUTS or session README or spec
   - If spec exists, use acceptance criteria from spec

7. **ASSUMPTIONS_ALLOWED** (if not provided)
   - Default to `yes`
   - If `no`, the plan must be fully concrete with no unknowns

## Step 4: RESEARCH PHASE (Enhanced with Subagents)

**CRITICAL**: Comprehensive research before planning is not optional.

### Step 4a: Create research directory

Create `.claude/<SESSION_SLUG>/research/` directory if it doesn't exist.

### Step 4b: Spawn Codebase Mapper + Web Research Agents IN PARALLEL

**IMPORTANT**: Run these agents in parallel for efficiency.

**Codebase Mapper Agent**:
```
Task: Spawn codebase-mapper agent

Input parameters:
- feature_description: {Extracted from INPUTS or spec}
- component_type: {Inferred from WORK_TYPE and INPUTS}
- scope: {SCOPE value}
- target: {TARGET value}
- constraints: {CONSTRAINTS if provided}
- frameworks: {Inferred from codebase or session context}
- session_slug: {SESSION_SLUG}

Expected output: `.claude/<SESSION_SLUG>/research/codebase-mapper.md`
```

**Web Research Agent**:
```
Task: Spawn web-research agent

Input parameters:
- research_topics: {Extract from feature description, WORK_TYPE, and technical context}
  Examples:
  - For new_feature: "Best practices for {feature_type}", "Security patterns for {use_case}"
  - For error_report: "Known issues with {technology}", "Common causes of {error_type}"
  - For refactor: "Refactoring patterns for {code_smell}", "Safe refactoring techniques"
  - For incident: "Recovery strategies for {failure_mode}", "Incident response best practices"
- context: {Feature description and goals}
- focus_areas: {Inferred from WORK_TYPE and RISK_TOLERANCE}
  - new_feature → security, performance, scalability
  - error_report → known bugs, CVEs, debugging techniques
  - refactor → safe refactoring, testing strategies
  - incident → mitigation, recovery, prevention
- tech_stack: {Frameworks from session or codebase}
- depth: medium (7 min for research-plan)
- session_slug: {SESSION_SLUG}

Expected output: `.claude/<SESSION_SLUG>/research/web-research.md`
```

### Step 4c: Wait for agents and read results

Wait for both agents to complete (or continue if they fail gracefully).

Read research outputs:
- `.claude/<SESSION_SLUG>/research/codebase-mapper.md` - Extract:
  - Similar features and patterns (for Section 2 of plan)
  - Naming conventions and architectural patterns
  - Integration points and dependencies
  - Error handling patterns
  - Risk hotspots

- `.claude/<SESSION_SLUG>/research/web-research.md` - Extract:
  - Industry best practices (for Section 2 of plan)
  - Security considerations
  - Performance insights
  - Technology comparisons
  - Case studies

### Step 4d: Fallback research (if agents fail)

If agents fail or time out, do manual research using Glob, Grep, and Read:

**4d.1: Identify impacted components**
- Entrypoints: API handlers, jobs, UI routes, CLIs
- Data stores: Tables, collections, queues, schemas
- Integrations: Third-party APIs, external services

**4d.2: Map dependencies**
- What calls what (high level call graph)
- What invariants must hold (contracts, assumptions)
- Critical paths (auth, payments, data integrity)

**4d.3: Identify "existing way of doing this here"**
- Naming patterns, error handling, config style, abstractions, test style

**4d.4: Identify risk hotspots**
- Auth/money/PII, concurrency, migrations, public APIs

**4d.5: Find similar examples**
- 2-3 existing features/modules most similar to what you're building/fixing

**Research output**: Document all findings with file paths and line numbers for "Current System Snapshot" section.

## Step 5: Choose and apply WORK_TYPE playbook

Based on WORK_TYPE, follow the appropriate playbook analysis:

### A) ERROR_REPORT playbook
Goal: reproduce → isolate → fix → prevent recurrence

Required analysis:
- **Symptoms**: What fails, where, how often, who impacted
- **Reproduction**: Exact steps OR best-approx reproduction harness
- **Hypotheses**: List 3–7 plausible causes with evidence
- **Root cause**: Pick most likely cause and explain causal chain
- **Fix strategy**:
  - Minimal fix
  - Hardening fix (optional)
  - Prevention (tests, alerts, guardrails)

### B) GREENFIELD_APP playbook
Goal: Ship an MVP safely without overengineering

Required analysis:
- **Product shape**:
  - Primary user journeys (top 3)
  - Core entities/data model
- **Architecture "just enough"**:
  - Choose simplest stack consistent with repo norms
  - Define module boundaries (3–7 modules)
- **Delivery plan**:
  - Milestone 0: Scaffolding + CI + local dev
  - Milestone 1: End-to-end happy path
  - Milestone 2: Harden (auth, validation, error handling, logging)
  - Milestone 3: Polish + docs + load testing (if needed)
- **Operational plan**:
  - Config, secrets, deploy strategy
  - Basic observability from day 1

### C) REFACTOR playbook
Goal: Improve structure without changing behavior (unless explicitly allowed)

Required analysis:
- **Refactor intent**: What pain is being removed (duplication, coupling, complexity)
- **Safety requirements**:
  - Define "behavior lock" tests (golden tests)
  - Define invariants that must not change
- **Sequencing**:
  - Propose stepwise plan that keeps main branch green
  - Identify intermediate states that must compile & pass tests
- **Risk controls**:
  - Feature flags if behavior might drift
  - Strict diff checks (API contracts, query counts, response schema)

### D) NEW_FEATURE playbook
Goal: Implement feature with clear contract, tests, rollout plan

Required analysis:
- **Spec crystallization**:
  - If spec exists from `/spec-crystallize`, USE IT as the authoritative source
  - Reference spec sections 3 (requirements), 4 (contracts), 5 (edge cases), 6 (acceptance criteria)
  - Plan should implement what the spec defines, not redefine it
  - If no spec exists, define behavior, edge cases, error cases in this plan
- **Design options**: Present 2–3 options (simple → robust), pick one with justification
- **Integration plan**: Where it plugs in, what it reuses, what it must not break
- **Rollout**: Feature flag / canary / migration plan, backward compatibility

### E) INCIDENT playbook
Goal: Stop the bleeding, restore service, understand root cause

Required analysis (similar to ERROR_REPORT but with urgency focus):
- **Immediate mitigation**: Fastest path to restore service
- **Temporary fix**: If full fix takes time, what's the short-term solution
- **Root cause**: Quick but thorough analysis
- **Permanent fix**: What needs to change long-term
- **Prevention**: What failed in detection/prevention

## Step 6: Generate options (Enhanced with Design Options Agent)

### Step 6a: Spawn Design Options Generator Agent

Spawn the design-options agent to systematically generate and compare design approaches:

```
Task: Spawn design-options agent

Input parameters:
- requirements: {Feature description and goals from INPUTS/spec}
- constraints: {CONSTRAINTS from Step 3}
- risk_tolerance: {RISK_TOLERANCE from Step 3}
- session_slug: {SESSION_SLUG}
- existing_patterns: {Summarize key findings from codebase-mapper.md}
- best_practices: {Summarize key findings from web-research.md}

Expected output: `.claude/<SESSION_SLUG>/research/design-options.md`
```

The Design Options Generator will:
1. Call codebase-mapper agent (if not already run) to get existing patterns
2. Call web-research agent (if not already run) to get industry approaches
3. Generate 2-3 distinct design options (minimal, balanced, robust)
4. Evaluate using decision matrix (complexity, risk, maintenance, scalability, cost)
5. Provide clear recommendation with rationale
6. Document what's NOT being done and why

### Step 6b: Wait for agent and read results

Wait for design-options agent to complete.

Read `.claude/<SESSION_SLUG>/research/design-options.md` to extract:
- 2-3 design options with trade-off analysis
- Decision matrix comparison
- Recommended approach with rationale
- What's NOT being done

Use these findings for Section 3 "Options Considered" of the plan.

### Step 6c: Fallback (if agent fails)

If design-options agent fails, manually generate 2-3 implementation approaches:
- Option 1: Minimal/simple approach
- Option 2: Balanced approach
- Option 3: Robust/comprehensive approach (if relevant)

For each option:
- Summary (2-3 sentences)
- Pros / Cons
- Risk level (low/medium/high)
- When to choose it

## Step 7: Recommend one approach

Pick the best option based on:
- RISK_TOLERANCE
- CONSTRAINTS
- Codebase patterns
- Simplicity

Provide clear rationale and explicitly state what you're NOT doing (to avoid overengineering).

## Step 8: Create step-by-step implementation plan

Break down into small, verifiable checkpoints. For each step:
- **Goal**: What this step achieves
- **Files/components to change**: Specific paths
- **Exact edits**: High-level description of changes
- **Tests/checks to run**: How to verify this step
- **"Done when" criteria**: Clear completion criteria

Steps should be:
- Small (1-4 hours each ideally)
- Independently testable
- Revertible if needed

## Step 9: Define comprehensive test plan

Specify tests across all layers:
- **Unit tests**: Which functions/classes need unit tests
- **Integration tests**: Which integrations need testing
- **E2E tests**: Which user journeys need E2E coverage
- **Regression tests**: For bug fixes or refactors
- **Non-functional tests**: Performance, security, load tests if relevant

## Step 10: Define observability & operability

- **Logs**: What to add/change (include redaction notes for PII)
- **Metrics**: What to track (ensure bounded cardinality)
- **Tracing**: What spans to add for distributed tracing
- **Alerts**: Only if justified (avoid alert fatigue)
- **Health checks**: For new services/critical paths

## Step 11: Define rollout & rollback

- **Rollout strategy**: Feature flags, canary, gradual rollout
- **Backward compatibility**: What old clients/services need to keep working
- **Rollback steps**: How to revert if things go wrong
- **Data migration**: If schema/data changes, how to migrate safely

## Step 12: Create risk register (Enhanced with Risk Analyzer Agent)

### Step 12a: Spawn Risk Analyzer Agent

Spawn the risk-analyzer agent to systematically identify and assess risks:

```
Task: Spawn risk-analyzer agent

Input parameters:
- approach: {Chosen design approach from Step 7}
- implementation_plan: {Step-by-step plan from Step 8}
- constraints: {CONSTRAINTS from Step 3}
- risk_tolerance: {RISK_TOLERANCE from Step 3}
- session_slug: {SESSION_SLUG}
- integration_points: {From codebase-mapper.md}
- security_context: {From web-research.md}

Expected output: `.claude/<SESSION_SLUG>/research/risk-analysis.md`
```

The Risk Analyzer will:
1. Identify risks across 8 categories (data integrity, auth, performance, ops, security, privacy, availability, dependencies)
2. Assess likelihood (1-5) and impact (1-5) for each risk
3. Calculate risk scores (likelihood × impact)
4. Propose concrete mitigations (preventive, detective, corrective)
5. Define detection methods (metrics, alerts, logs, tests)
6. Prioritize by risk score (P0-P3)

### Step 12b: Wait for agent and read results

Wait for risk-analyzer agent to complete.

Read `.claude/<SESSION_SLUG>/research/risk-analysis.md` to extract:
- Top 3-5 highest priority risks (risk score ≥ 12)
- Concrete mitigations for each risk
- Detection methods (alerts, metrics, tests)
- Residual risks after mitigation

Use these findings for Section 9 "Risk Register" of the plan.

### Step 12c: Fallback (if agent fails)

If risk-analyzer agent fails, manually identify top 3-7 risks:
- **Risk description**
- **Likelihood**: low/medium/high
- **Impact**: low/medium/high
- **Mitigation**: How to reduce risk
- **Detection**: How to detect if risk materializes

## Step 13: Generate the research plan document

Create plan file with milestone-aware naming:
- If MILESTONE is `mvp`: `.claude/<SESSION_SLUG>/plan/research-plan-mvp.md`
- If MILESTONE is `m1`: `.claude/<SESSION_SLUG>/plan/research-plan-m1.md`
- If MILESTONE is `m2`: `.claude/<SESSION_SLUG>/plan/research-plan-m2.md`
- If MILESTONE is `m3`: `.claude/<SESSION_SLUG>/plan/research-plan-m3.md`
- If MILESTONE is `full` or no triage: `.claude/<SESSION_SLUG>/plan/research-plan.md`

Include full structure (see OUTPUT FORMAT below) with milestone clearly marked in frontmatter and title.

## Step 14: Update session README

Update `.claude/<SESSION_SLUG>/README.md`:
1. Find the artifacts section
2. Check off `[ ]` → `[x]` for `plan/research-plan.md`
3. Add to "Recent Activity" section:
   ```markdown
   - {YYYY-MM-DD}: Created research plan via `/research-plan`
   ```

## Step 15: Output summary

Print a summary with key findings and next steps.

# OUTPUT FORMAT

Create `.claude/<SESSION_SLUG>/plan/research-plan.md` with:

```markdown
---
command: /research-plan
session_slug: {SESSION_SLUG}
date: {YYYY-MM-DD}
milestone: {mvp | m1 | m2 | m3 | full}
work_type: {WORK_TYPE}
scope: {SCOPE}
target: {TARGET}
risk_tolerance: {RISK_TOLERANCE}
assumptions_allowed: {ASSUMPTIONS_ALLOWED}
related:
  session: ../README.md
  spec: ../spec/spec-crystallize.md (if exists)
  triage: ../plan/scope-triage.md (if exists)
  previous_plan: ../plan/research-plan-mvp.md (if M1+, link to previous milestone)
  repro: ../incidents/repro-harness.md (if exists)
---

# Research + Plan: {Title} [{MILESTONE}]

{If M1+, add context section:}
## Built in Previous Milestones

**MVP (completed):**
- {Summary of what was built}
- See: [research-plan-mvp.md](./research-plan-mvp.md)

{If M2+:}
**M1 (completed):**
- {Summary of what was built}
- See: [research-plan-m1.md](./research-plan-m1.md)

## 0) Task Classification

**Work Type:** {WORK_TYPE}

**Scope/Target:** {SCOPE} / {TARGET}

**Inputs Summarized:**
- {3-10 bullets summarizing key inputs}

**Constraints:**
{List or "None specified"}

**Non-Goals:**
{List or "None specified"}

**Success Criteria:**
{Numbered list of measurable criteria}

---

## 1) Facts / Assumptions / Unknowns

### Facts (Supported by Evidence)

{List facts with citations: file paths, line numbers, quotes from code/docs}

Example:
- API endpoint `/api/users` defined in `src/routes/users.ts:45-120`
- Current error handling pattern uses `try/catch` with structured logging (see `src/lib/errors.ts:12-50`)

### Assumptions (Explicit)

{List assumptions clearly marked as such}

Example:
- **ASSUMPTION**: Users will not upload files larger than 100MB (no explicit limit currently)
- **ASSUMPTION**: CSV parsing can happen synchronously (based on expected file sizes)

### Unknowns / Questions

{Max 8 questions - only ones that materially change the plan}

Example:
- Do we need to support Excel files in addition to CSV? (affects parser choice)
- What's the expected peak upload rate? (affects async processing decision)

---

## 2) Current System Snapshot (From Research)

### Codebase Analysis (from codebase-mapper agent)

**Similar Features Found:**
- {Feature 1}: {Pattern summary} (`{file_path}:{line}`)
- {Feature 2}: {Pattern summary} (`{file_path}:{line}`)
- {Feature 3}: {Pattern summary} (`{file_path}:{line}`)

**Key Patterns:**
- **Naming**: {Convention description with examples}
- **Architecture**: {Layer structure and organization}
- **Error Handling**: {Error pattern with existing codes}
- **Integration**: {How features integrate with auth, DB, APIs, events}

**Risk Hotspots Identified:**
- {Hotspot 1}: {Description of risk area}
- {Hotspot 2}: {Description of risk area}

**Relevant Modules/Files:**
- `{file_path}` - {Description and relevance}
- `{file_path}` - {Description and relevance}
- `{file_path}` - {Description and relevance}

[Full codebase analysis: research/codebase-mapper.md](../research/codebase-mapper.md)

### Industry Best Practices (from web-research agent)

**Key Recommendations:**
- {Recommendation 1}: {Summary} - Source: [{source}]({URL})
- {Recommendation 2}: {Summary} - Source: [{source}]({URL})
- {Recommendation 3}: {Summary} - Source: [{source}]({URL})

**Security Considerations:**
- {Security finding 1} (OWASP)
- {Security finding 2}

**Performance Insights:**
- {Performance finding 1} (benchmark: {numbers})
- {Performance finding 2}

**Technology Comparisons:**
- {Technology A vs B}: {Key trade-offs}

[Full web research: research/web-research.md](../research/web-research.md)

### Key Invariants and Contracts

{List critical assumptions, contracts, constraints from research}

Example:
- Customer email must be unique (enforced at DB level)
- All uploads require authentication
- File uploads max 50MB

### Dependencies & Touchpoints

{Map what calls what, what integrates with what - from codebase-mapper}

Example:
- Upload system depends on: S3 storage, Redis queue, PostgreSQL
- Customers model touched by: API routes, admin panel, reports system
- Changes will affect: API docs, client SDK

---

## 3) Options Considered (from design-options agent)

### Option 1: {Name} ⭐ RECOMMENDED (if recommended)

**Summary:**
{2-3 sentences}

**Pros:**
- ✅ {Benefit 1}
- ✅ {Benefit 2}
- ✅ {Benefit 3}

**Cons:**
- ❌ {Downside 1}
- ❌ {Downside 2}

**Trade-offs:**
- **Complexity**: {Low/Medium/High} - {Details}
- **Risk**: {Low/Medium/High} - {Details}
- **Maintenance**: {Low/Medium/High} - {Details}
- **Scalability**: {Low/Medium/High} - {Details}
- **Cost**: {Low/Medium/High} - {Details}

**Codebase Fit**: {Score 1-5}/5 - {Why}
**Best Practice Fit**: {Score 1-5}/5 - {Why}

**When to Choose:**
{Conditions under which this option is best}

### Option 2: {Name}

**Summary:**
{2-3 sentences}

**Pros:**
- ✅ {Benefit 1}
- ✅ {Benefit 2}

**Cons:**
- ❌ {Downside 1}
- ❌ {Downside 2}

**Trade-offs:**
- **Complexity**: {Low/Medium/High} - {Details}
- **Risk**: {Low/Medium/High} - {Details}
- **Maintenance**: {Low/Medium/High} - {Details}

**Codebase Fit**: {Score 1-5}/5 - {Why}
**Best Practice Fit**: {Score 1-5}/5 - {Why}

**When to Choose:**
{Conditions under which this option is best}

### Option 3: {Name} (if applicable)

{Repeat structure}

### Decision Matrix

| Criterion | Option 1 | Option 2 | Option 3 |
|-----------|----------|----------|----------|
| Complexity | {rating} | {rating} | {rating} |
| Risk | {rating} | {rating} | {rating} |
| Maintenance | {rating} | {rating} | {rating} |
| Scalability | {rating} | {rating} | {rating} |
| Cost | {rating} | {rating} | {rating} |
| Codebase Fit | {score}/5 | {score}/5 | {score}/5 |
| Best Practice Fit | {score}/5 | {score}/5 | {score}/5 |

[Full design options analysis: research/design-options.md](../research/design-options.md)

---

## 4) Recommended Approach

**Selected Option:** {Option name}

**Rationale:**
{One paragraph explaining why this option is best given constraints, risk tolerance, and codebase patterns}

**What We Are NOT Doing:**
{Explicit list of features/complexity being avoided to prevent overengineering}

Example:
- NOT building a generic import framework (just CSV for now)
- NOT adding real-time progress updates (simple status polling is sufficient)
- NOT supporting resume-on-failure (re-upload is acceptable for MVP)

---

## 5) Step-by-Step Implementation Plan

### Step 1: {Title - e.g., "Add CSV Upload Endpoint"}

**Goal:**
{What this step achieves}

**Files/Components to Change:**
- `src/routes/customers.ts` - Add new POST `/api/customers/upload` endpoint
- `src/lib/csv-validator.ts` - Create CSV validation utility

**Exact Edits:**
1. Create endpoint handler following existing upload pattern from `src/routes/upload.ts`
2. Add multipart/form-data parser middleware
3. Validate file type is CSV
4. Save to temp storage
5. Return upload ID

**Tests/Checks:**
- Unit test: CSV validation accepts valid files, rejects invalid
- Integration test: POST to endpoint with CSV returns 200 + upload ID
- Integration test: POST with non-CSV returns 400

**Done When:**
- [ ] Endpoint responds to requests
- [ ] Tests pass
- [ ] API docs updated

### Step 2: {Title - e.g., "Implement CSV Parsing"}

{Repeat structure for each step}

### Step 3: {Title - e.g., "Add Duplicate Detection"}

{Continue for all implementation steps...}

---

## 6) Test Plan

### Unit Tests

**Files to create/update:**
- `tests/unit/lib/csv-parser.test.ts` - Test CSV parsing logic
  - Valid CSV parsing
  - Malformed CSV handling
  - Edge cases (empty file, headers only, special characters)

- `tests/unit/lib/duplicate-detector.test.ts` - Test duplicate detection
  - Exact match detection
  - Fuzzy match logic
  - Performance with large datasets

**Coverage Target:** 90%+ for new utilities

### Integration Tests

**Files to create/update:**
- `tests/integration/customer-upload.test.ts` - Test full upload flow
  - Happy path: upload → preview → commit
  - Error cases: invalid CSV, upload failure, duplicate detection
  - Edge cases: empty file, very large file, concurrent uploads

### E2E Tests (if applicable)

**Scenarios:**
- User uploads CSV from UI, sees preview, commits successfully
- User uploads duplicate data, sees warning, chooses to skip

### Regression Tests

{For bug fixes or refactors}
- Golden test: snapshot current behavior before changes
- Comparison test: ensure output matches golden after refactor

### Non-Functional Tests

**Performance:**
- Benchmark CSV parsing with 10K, 100K, 1M rows
- Target: < 5s for 100K rows

**Security:**
- Test CSV injection attacks
- Test file size limits
- Test authentication/authorization

---

## 7) Observability & Operability

### Logs to Add/Change

**New log statements:**
```javascript
// In upload handler
logger.info('customer_csv_upload_started', {
  uploadId,
  userId,
  fileSize,
  // Redact: no customer PII in logs
});

logger.info('customer_csv_parsed', {
  uploadId,
  rowCount,
  validRows,
  invalidRows,
});
```

**Redaction Rules:**
- Never log customer email, name, phone
- Log counts/aggregates only

### Metrics to Add

**New metrics:**
- `customer_upload.started` (counter)
- `customer_upload.completed` (counter, with status label: success/failure)
- `customer_upload.duration` (histogram)
- `customer_upload.rows_processed` (histogram)
- `customer_upload.duplicates_found` (counter)

**Cardinality:** All metrics use bounded labels (status, error_type)

### Tracing

**New spans:**
- `customer-upload` - Full upload operation
- `csv-parse` - Parsing phase
- `duplicate-check` - Duplicate detection phase
- `database-insert` - Batch insert phase

### Alerts (if justified)

{Only add if necessary}
- Alert if error rate > 10% for 5 minutes
- Alert if P95 duration > 60s for 10 minutes

### Health Checks

- Add `/health/upload-system` endpoint checking:
  - Temp storage accessible
  - Database connection
  - Redis queue available

---

## 8) Rollout & Rollback

### Rollout Strategy

**Phase 1: Internal Testing**
- Deploy to staging
- Test with internal team using real customer data samples
- Duration: 3 days

**Phase 2: Beta Release**
- Feature flag: `customer_csv_upload` (default: false)
- Enable for 5% of users (specific beta accounts)
- Monitor errors, performance, user feedback
- Duration: 1 week

**Phase 3: Gradual Rollout**
- Increase to 25%, then 50%, then 100% over 2 weeks
- Rollback if error rate > 5%

### Backward Compatibility Notes

- No breaking changes to existing API
- New endpoint is additive
- Old import methods continue to work

### Rollback Steps

**If issues detected:**
1. Set feature flag `customer_csv_upload = false` (takes effect immediately)
2. If data corruption: run cleanup script `scripts/rollback-imports.ts`
3. Revert deployment if feature flag insufficient

**Rollback time:** < 5 minutes

### Data Migration/Backfill Plan

{If schema changes are needed}

**Migration:** `migrations/2026-01-15-add-import-tracking.sql`
- Add `customers.import_id` column (nullable, indexed)
- Add `customer_imports` table
- Backfill not needed (new data only)

**Rollback Migration:** `migrations/2026-01-15-add-import-tracking.down.sql`
- Drop column and table

---

## 9) Risk Register (from risk-analyzer agent)

### Top Risks (Risk Score ≥ 12)

| # | Risk | Likelihood | Impact | Risk Score | Mitigation | Detection |
|---|------|------------|--------|------------|------------|-----------|
| 1 | {Risk 1 title} | {1-5} ({rating}) | {1-5} ({rating}) | **{score}** | {Mitigation summary} | {Detection method} |
| 2 | {Risk 2 title} | {1-5} ({rating}) | {1-5} ({rating}) | **{score}** | {Mitigation summary} | {Detection method} |
| 3 | {Risk 3 title} | {1-5} ({rating}) | {1-5} ({rating}) | **{score}** | {Mitigation summary} | {Detection method} |
| 4 | {Risk 4 title} | {1-5} ({rating}) | {1-5} ({rating}) | **{score}** | {Mitigation summary} | {Detection method} |
| 5 | {Risk 5 title} | {1-5} ({rating}) | {1-5} ({rating}) | **{score}** | {Mitigation summary} | {Detection method} |

**Legend**:
- Likelihood: 1=Very Unlikely, 2=Unlikely, 3=Possible, 4=Likely, 5=Very Likely
- Impact: 1=Minimal, 2=Low, 3=Moderate, 4=High, 5=Critical
- Risk Score = Likelihood × Impact (1-25)

### Risk Mitigation Roadmap

**Pre-Launch (P0 - Risk Score 20-25)**:
- [ ] {Mitigation 1 for highest risk}
- [ ] {Mitigation 2 for highest risk}

**Pre-GA (P1 - Risk Score 12-19)**:
- [ ] {Mitigation 1 for high risk}
- [ ] {Mitigation 2 for high risk}
- [ ] {Mitigation 3 for high risk}

**Post-GA (P2 - Risk Score 6-11)**:
- [ ] {Mitigation 1 for medium risk}
- [ ] {Mitigation 2 for medium risk}

### Detection & Monitoring

**Alerts to Create**:
- {Alert 1}: {Condition} → {Notification channel}
- {Alert 2}: {Condition} → {Notification channel}

**Metrics to Track**:
- {Metric 1}: {Purpose and threshold}
- {Metric 2}: {Purpose and threshold}

**Tests to Write**:
- {Test type 1}: {Risk coverage}
- {Test type 2}: {Risk coverage}

[Full risk analysis: research/risk-analysis.md](../research/risk-analysis.md)

---

## Next Steps

1. Review this plan with team/stakeholders
2. Resolve unknowns in section 1.3 if needed
3. Run `/decision-record` for significant architectural decisions (if any)
4. Begin implementation following step-by-step plan in section 5
5. Run `/work` to log implementation progress
6. Run relevant `/review-*` commands before merging

---

*Plan generated: {YYYY-MM-DD}*
*Session: [{SESSION_SLUG}](../README.md)*
```

# SUMMARY OUTPUT

After creating the plan, print:

```markdown
# Research Plan Complete

## Plan Location
Saved to: `.claude/{SESSION_SLUG}/plan/research-plan.md`

## Research Summary
- Files researched: {count}
- Similar patterns found: {count}
- Components impacted: {list}
- Risk hotspots identified: {count}

## Recommended Approach
{One-sentence summary of chosen option}

## Implementation Overview
- Total steps: {count}
- Estimated complexity: {low/medium/high}
- Key risks: {top 3}

## Next Command to Run

/work
SESSION_SLUG: {SESSION_SLUG}
CHECKPOINT: Starting implementation of {feature/fix title}
```

# IMPORTANT: Research-First Approach

This command emphasizes **research over guessing**:
1. **Spend time exploring the codebase** before proposing solutions
2. **Find and reference existing patterns** - don't invent new ones
3. **Cite evidence** - always include file paths and line numbers
4. **Separate facts from assumptions** - be explicit about unknowns
5. **Keep plans executable** - small steps, clear criteria
6. **Think about operations** - observability, rollout, rollback

The plan should feel grounded in the actual codebase, not generic advice.

# EXAMPLE USAGE

**User input:**
```
/research-plan
INPUTS: Need to implement the CSV bulk import feature we spec'd. Users upload CSV, preview data, commit to database with duplicate detection.
```

**Agent:**
1. Infers SESSION_SLUG from last entry in `.claude/README.md`: `csv-bulk-import`
2. Reads session README for context
3. Reads spec from `.claude/csv-bulk-import/spec/spec-crystallize.md`
4. Researches codebase extensively:
   - Finds existing upload patterns
   - Finds CSV parsing utilities
   - Identifies customer model and constraints
   - Maps dependencies and risk hotspots
5. Applies NEW_FEATURE playbook
6. Generates 3 options (sync, async, streaming)
7. Recommends async approach based on risk tolerance
8. Creates detailed step-by-step plan with 8 steps
9. Defines comprehensive test plan
10. Adds observability and rollout strategy
11. Identifies 6 key risks with mitigations
12. Saves plan to `.claude/csv-bulk-import/plan/research-plan.md`
13. Updates session README
14. Outputs summary with next command
