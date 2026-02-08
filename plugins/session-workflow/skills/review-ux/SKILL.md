---
name: review:ux
description: UX-focused review running 4 user experience review commands in parallel
---

# UX Code Review

Run 4 user experience review commands in parallel, then merge findings.

## Execution

Spawn these review commands as parallel Task agents. Each agent must:
1. Read the command file at the given path
2. Follow its WORKFLOW exactly
3. Return the complete review report

### Parallel Commands
1. `commands/review/accessibility.md` — Keyboard, assistive technology, ARIA
2. `commands/review/frontend-accessibility.md` — SPA-specific accessibility issues
3. `commands/review/frontend-performance.md` — Bundle size, rendering, latency
4. `commands/review/ux-copy.md` — User-facing text clarity, error recovery

## Task Agent Prompt Template

For each command, spawn a Task agent with this prompt:
"Read and execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{name}.md`. Follow its WORKFLOW exactly. Review the current working tree changes (`git diff`). Return the complete review report as specified in the command's OUTPUT FORMAT."

## After All Complete: Merge

Combine all 4 agent reports into a single UX review:
- Deduplicate findings that appear in multiple reports
- Sort by severity (BLOCKER > HIGH > MED > LOW > NIT)
- Merge file summaries across all reports
- Include WCAG compliance assessment from accessibility commands
- Produce unified assessment: UX quality recommendation
