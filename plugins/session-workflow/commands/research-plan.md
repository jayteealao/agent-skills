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

## Step 3: RESEARCH PHASE (do this before proposing solutions)

**CRITICAL**: Spend significant time researching the codebase before planning. This is not optional.

Use Glob, Grep, and Read tools extensively to:

### 3.1: Identify impacted components
- **Entrypoints**: API handlers, jobs, UI routes, CLIs
- **Data stores**: Tables, collections, queues, schemas
- **Integrations**: Third-party APIs, external services

### 3.2: Map dependencies
- What calls what (high level call graph)
- What invariants must hold (contracts, assumptions)
- Critical paths (auth, payments, data integrity)

### 3.3: Identify "existing way of doing this here"
- **Naming patterns**: How similar features/modules are named
- **Error handling**: Pattern for errors, logging, retries
- **Config style**: How configuration is managed
- **Abstractions**: What base classes, interfaces, utilities exist
- **Test style**: How tests are structured and named

### 3.4: Identify risk hotspots
- **Auth/money/PII**: Sensitive code paths
- **Concurrency**: Async boundaries, race conditions
- **Migrations**: Schema changes, data migrations, backward compatibility
- **Public APIs**: Changes that affect external consumers

### 3.5: Find similar examples (critical)
Search for 2-3 existing features/modules that are most similar to what you're building/fixing:
- Note file paths and structure
- Identify patterns to replicate
- Understand why they're structured that way

**Research output**: Document all findings with file paths and line numbers. This forms the "Current System Snapshot" section.

## Step 4: Choose and apply WORK_TYPE playbook

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

## Step 5: Generate options (2-3)

Present 2-3 implementation approaches with different trade-offs:
- Option 1: Minimal/simple approach
- Option 2: Balanced approach
- Option 3: Robust/comprehensive approach (if relevant)

For each option:
- Summary (2-3 sentences)
- Pros / Cons
- Risk level (low/medium/high)
- When to choose it

## Step 6: Recommend one approach

Pick the best option based on:
- RISK_TOLERANCE
- CONSTRAINTS
- Codebase patterns
- Simplicity

Provide clear rationale and explicitly state what you're NOT doing (to avoid overengineering).

## Step 7: Create step-by-step implementation plan

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

## Step 8: Define comprehensive test plan

Specify tests across all layers:
- **Unit tests**: Which functions/classes need unit tests
- **Integration tests**: Which integrations need testing
- **E2E tests**: Which user journeys need E2E coverage
- **Regression tests**: For bug fixes or refactors
- **Non-functional tests**: Performance, security, load tests if relevant

## Step 9: Define observability & operability

- **Logs**: What to add/change (include redaction notes for PII)
- **Metrics**: What to track (ensure bounded cardinality)
- **Tracing**: What spans to add for distributed tracing
- **Alerts**: Only if justified (avoid alert fatigue)
- **Health checks**: For new services/critical paths

## Step 10: Define rollout & rollback

- **Rollout strategy**: Feature flags, canary, gradual rollout
- **Backward compatibility**: What old clients/services need to keep working
- **Rollback steps**: How to revert if things go wrong
- **Data migration**: If schema/data changes, how to migrate safely

## Step 11: Create risk register

Identify top 3-7 risks:
- **Risk description**
- **Likelihood**: low/medium/high
- **Impact**: low/medium/high
- **Mitigation**: How to reduce risk
- **Detection**: How to detect if risk materializes

## Step 12: Generate the research plan document

Create plan file with milestone-aware naming:
- If MILESTONE is `mvp`: `.claude/<SESSION_SLUG>/plan/research-plan-mvp.md`
- If MILESTONE is `m1`: `.claude/<SESSION_SLUG>/plan/research-plan-m1.md`
- If MILESTONE is `m2`: `.claude/<SESSION_SLUG>/plan/research-plan-m2.md`
- If MILESTONE is `m3`: `.claude/<SESSION_SLUG>/plan/research-plan-m3.md`
- If MILESTONE is `full` or no triage: `.claude/<SESSION_SLUG>/plan/research-plan.md`

Include full structure (see OUTPUT FORMAT below) with milestone clearly marked in frontmatter and title.

## Step 13: Update session README

Update `.claude/<SESSION_SLUG>/README.md`:
1. Find the artifacts section
2. Check off `[ ]` → `[x]` for `plan/research-plan.md`
3. Add to "Recent Activity" section:
   ```markdown
   - {YYYY-MM-DD}: Created research plan via `/research-plan`
   ```

## Step 14: Output summary

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

### Relevant Modules/Files

{List key files with brief descriptions}

Example:
- `src/routes/upload.ts:1-200` - Existing file upload handler (images only currently)
- `src/lib/csv-parser.ts:1-150` - CSV parsing utility (used in exports)
- `src/models/Customer.ts:1-80` - Customer data model
- `src/jobs/ProcessImportJob.ts:1-120` - Background job infrastructure

### Existing Patterns to Follow

{Document naming, error handling, config, abstraction patterns found}

Example:
- **Naming**: Upload routes follow pattern `/api/{resource}/upload`
- **Error handling**: Controllers use `ApiError` class with status codes (see `src/lib/errors.ts`)
- **Async jobs**: Background processing uses BullMQ (see `src/jobs/` directory)
- **Testing**: Integration tests in `tests/integration/{feature}.test.ts`

### Key Invariants and Contracts

{List critical assumptions, contracts, constraints}

Example:
- Customer email must be unique (enforced at DB level, `customers` table unique constraint)
- All uploads require authentication (middleware in `src/middleware/auth.ts`)
- File uploads max 50MB (configured in `src/config/upload.ts`)

### Dependencies & Touchpoints

{Map what calls what, what integrates with what}

Example:
- Upload system depends on: S3 storage, Redis queue, PostgreSQL
- Customers model touched by: API routes, admin panel, reports system
- Changes will affect: API docs (auto-generated), client SDK

### Risk Hotspots

{Identify sensitive areas}

Example:
- **PII**: Customer data includes email, name, phone - need redaction in logs
- **Data integrity**: Duplicate detection critical - could create billing issues
- **Concurrency**: Multiple uploads of same file could race - need idempotency
- **Public API**: `/api/customers/upload` is used by mobile app - need versioning

---

## 3) Options Considered

### Option 1: {Name - e.g., "Synchronous Processing"}

**Summary:**
{2-3 sentences}

**Pros:**
- {Benefit 1}
- {Benefit 2}

**Cons:**
- {Downside 1}
- {Downside 2}

**Risk Level:** {low/medium/high}

**When to Choose:**
{Conditions under which this option is best}

### Option 2: {Name - e.g., "Async Job Processing"}

**Summary:**
{2-3 sentences}

**Pros:**
- {Benefit 1}
- {Benefit 2}

**Cons:**
- {Downside 1}
- {Downside 2}

**Risk Level:** {low/medium/high}

**When to Choose:**
{Conditions under which this option is best}

### Option 3: {Name - e.g., "Streaming + Chunked Processing"} (if applicable)

{Repeat structure}

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

## 9) Risk Register

| Risk | Likelihood | Impact | Mitigation | Detection |
|------|------------|--------|------------|-----------|
| Duplicate detection fails, creates duplicate customers | Medium | High | Thorough testing with realistic data; add DB constraint as backup | Monitor `duplicates_found` metric, check customer complaints |
| Large CSV files cause memory issues | Low | High | Stream processing, limit file size to 50MB, async jobs | Monitor memory usage, P95 duration metric |
| CSV injection attack (formula injection) | Low | Medium | Sanitize cell values, escape formulas | Security testing, alert on suspicious patterns |
| Race condition on concurrent uploads | Medium | Medium | Add upload locking by user, idempotency keys | Integration tests with concurrent requests |
| Data loss if job fails mid-processing | Low | High | Transactional batch inserts, job retry logic | Monitor job failure rate, manual data validation |
| Performance degradation under load | Medium | Medium | Async processing, rate limiting, load testing | P95 duration alerts, queue depth monitoring |

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
