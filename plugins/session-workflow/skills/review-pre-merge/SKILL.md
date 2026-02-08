---
name: review:pre-merge
description: Pre-merge review running 5 critical review commands in parallel
---

# Pre-Merge Code Review

Run 5 critical pre-merge review commands in parallel, then merge findings.

## Execution

Spawn these review commands as parallel Task agents. Each agent must:
1. Read the command file at the given path
2. Follow its WORKFLOW exactly
3. Return the complete review report

### Parallel Commands
1. `commands/review/correctness.md` — Logic flaws, broken invariants, edge-case failures
2. `commands/review/testing.md` — Test quality, coverage, reliability
3. `commands/review/security.md` — Vulnerabilities, insecure defaults, missing controls
4. `commands/review/refactor-safety.md` — Semantic drift, behavior equivalence
5. `commands/review/maintainability.md` — Readability, change amplification

## Task Agent Prompt Template

For each command, spawn a Task agent with this prompt:
"Read and execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{name}.md`. Follow its WORKFLOW exactly. Review the current working tree changes (`git diff`). Return the complete review report as specified in the command's OUTPUT FORMAT."

## After All Complete: Merge

Combine all 5 agent reports into a single pre-merge review:
- Deduplicate findings that appear in multiple reports
- Sort by severity (BLOCKER > HIGH > MED > LOW > NIT)
- Merge file summaries across all reports
- Highlight any BLOCKER issues that must be resolved before merge
- Produce unified assessment: Merge / Don't Merge
