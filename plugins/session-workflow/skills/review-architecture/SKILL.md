---
name: review:architecture
description: Architecture-focused review running 4 architecture review commands in parallel
---

# Architecture Code Review

Run 4 architecture review commands in parallel, then merge findings.

## Execution

Spawn these review commands as parallel Task agents. Each agent must:
1. Read the command file at the given path
2. Follow its WORKFLOW exactly
3. Return the complete review report

### Parallel Commands
1. `commands/review/architecture.md` — Boundaries, dependencies, layering
2. `commands/review/performance.md` — Algorithmic efficiency, N+1 queries, bottlenecks
3. `commands/review/scalability.md` — Load handling, dataset growth, multi-tenancy
4. `commands/review/api-contracts.md` — Stability, correctness, consumer usability

## Task Agent Prompt Template

For each command, spawn a Task agent with this prompt:
"Read and execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{name}.md`. Follow its WORKFLOW exactly. Review the current working tree changes (`git diff`). Return the complete review report as specified in the command's OUTPUT FORMAT."

## After All Complete: Merge

Combine all 4 agent reports into a single architecture review:
- Deduplicate findings that appear in multiple reports
- Sort by severity (BLOCKER > HIGH > MED > LOW > NIT)
- Merge file summaries across all reports
- Include architectural map from the architecture command
- Produce unified assessment: Architecture health recommendation
