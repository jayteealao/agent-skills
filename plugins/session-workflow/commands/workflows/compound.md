---
name: workflows:compound
description: Document a recently solved problem to compound your project's knowledge
argument-hint: "[optional: brief context about the fix]"
---

# /workflows:compound

## CRITICAL: Command Execution Instructions

**DO NOT use TodoWrite or EnterPlanMode for this command.**

This command spawns parallel subagents to document solved problems in `.claude/solutions/`. Follow the parallel subagent strategy below EXACTLY.

Coordinate multiple subagents working in parallel to document a recently solved problem.

## Purpose

Captures problem solutions while context is fresh, creating structured documentation in `.claude/solutions/` with YAML frontmatter for searchability and future reference. Uses parallel subagents for maximum efficiency.

**Why "compound"?** Each documented solution compounds your project's knowledge. The first time you solve a problem takes research. Document it, and the next occurrence takes minutes. Knowledge compounds.

## Usage

```bash
/workflows:compound                    # Document the most recent fix
/workflows:compound [brief context]    # Provide additional context hint
```

## Execution Strategy: Parallel Subagents

This command launches multiple specialized subagents IN PARALLEL to maximize efficiency:

### 1. **Context Analyzer** (Parallel)
   - Extracts conversation history
   - Identifies problem type, component, symptoms
   - Validates against schema
   - Returns: YAML frontmatter skeleton

### 2. **Solution Extractor** (Parallel)
   - Analyzes all investigation steps
   - Identifies root cause
   - Extracts working solution with code examples
   - Returns: Solution content block

### 3. **Related Docs Finder** (Parallel)
   - Searches `.claude/solutions/` for related documentation
   - Identifies cross-references and links
   - Returns: Links and relationships

### 4. **Prevention Strategist** (Parallel)
   - Develops prevention strategies
   - Creates best practices guidance
   - Generates test cases if applicable
   - Returns: Prevention/testing content

### 5. **Category Classifier** (Parallel)
   - Determines optimal `.claude/solutions/` category
   - Validates category against schema
   - Suggests filename based on slug
   - Returns: Final path and filename

### 6. **Documentation Writer** (Sequential - after 1-5 complete)
   - Assembles complete markdown file from all subagent results
   - Validates YAML frontmatter
   - Formats content for readability
   - Creates the file in correct location

## What It Captures

- **Problem symptom**: Exact error messages, observable behavior
- **Investigation steps tried**: What didn't work and why
- **Root cause analysis**: Technical explanation
- **Working solution**: Step-by-step fix with code examples
- **Prevention strategies**: How to avoid in future
- **Cross-references**: Links to related issues and docs

## Preconditions

<preconditions enforcement="advisory">
  <check condition="problem_solved">
    Problem has been solved (not in-progress)
  </check>
  <check condition="solution_verified">
    Solution has been verified working
  </check>
  <check condition="non_trivial">
    Non-trivial problem (not simple typo or obvious error)
  </check>
</preconditions>

## What It Creates

**Organized documentation:**

- File: `.claude/solutions/[category]/[filename].md`

**Categories auto-detected from problem:**

- build-errors/
- test-failures/
- runtime-errors/
- performance-issues/
- database-issues/
- security-issues/
- ui-bugs/
- integration-issues/
- logic-errors/
- config-errors/
- developer-experience/
- workflow-issues/
- best-practices/
- documentation-gaps/

## Success Output

```
Parallel documentation generation complete

Primary Subagent Results:
  Context Analyzer: Identified performance_issue in api component
  Solution Extractor: Extracted 3 code fixes
  Related Docs Finder: Found 2 related issues
  Prevention Strategist: Generated test cases
  Category Classifier: .claude/solutions/performance-issues/
  Documentation Writer: Created complete markdown

File created:
- .claude/solutions/performance-issues/n-plus-one-api-calls-20260208.md

This documentation will be searchable for future reference when similar
issues occur.

What's next?
1. Continue workflow (recommended)
2. Add to Critical Patterns
3. Link related documentation
4. View documentation
5. Other
```

## The Compounding Philosophy

This creates a compounding knowledge system:

1. First time you solve "N+1 query in API layer" -> Research (30 min)
2. Document the solution -> .claude/solutions/performance-issues/n-plus-one.md (5 min)
3. Next time similar issue occurs -> Quick lookup (2 min)
4. Knowledge compounds -> Each session gets smarter

The feedback loop:

```
Build -> Test -> Find Issue -> Research -> Fix -> Document -> Deploy
    ^                                                           |
    +-----------------------------------------------------------+
```

**Each unit of engineering work should make subsequent units of work easier -- not harder.**

## Auto-Invoke

<auto_invoke>
<trigger_phrases>
- "that worked"
- "it's fixed"
- "working now"
- "problem solved"
</trigger_phrases>

<manual_override>
Use /workflows:compound [context] to document immediately without waiting for auto-detection.
</manual_override>
</auto_invoke>

## Routes To

`compound-docs` skill

## Related Commands

- `/workflows:plan` - Planning workflow (references documented solutions via deepen-plan)
- `/debug` - Systematic debugging (creates todos for fixes)
- `/triage` - Triage findings and prioritize work
