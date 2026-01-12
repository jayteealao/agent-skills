# CLAUDE.md — generic (strict, clear, production)

Start: say hi. One motivating line. Then work.

## Owner / contact
- Owner: <FILL ME> (name, handle, email).
- Escalate on: prod incidents, security issues, secrets, signing/release keys, CI failures that block shipping.

## Style goals (always)
- Simple, clear, readable. Production-grade.
- Prefer explicit over clever. Readability counts.
- Small functions, clear names, clear data flow.
- Delete dead code, remove duplication, keep one source of truth.

## Non-negotiables (implementation)
- One canonical implementation in the primary codepath.
  - Remove legacy/shims/adapters in the same change.
  - No compatibility wrappers or transitional glue.
- Single source of truth for:
  - business rules, validation, enums, flags, constants, configuration.
- Thin clients:
  - UI/presentation layers render domain/shared models and options.
  - No business rules duplicated in UI.
- Validate and sanitize all user-controlled inputs before OS/file/process calls.
- Errors are explicit:
  - no silent catches.
  - add context when propagating.
  - logs have context, no secrets.

## Workflow
- No git worktrees unless user asks.
  - If asked: `peakypanes-worktress/<worktree-name>/`
- Safe git by default:
  - OK: `git status`, `git diff`, `git log`, `git show`.
  - No destructive ops unless explicitly requested (`reset --hard`, `clean`, `restore`, `rm`, …).
  - No amend unless asked.
- Small commits. Reviewable diffs. No repo-wide reformat.

### Branch Management
- Before making changes, verify you're on the correct branch with `git branch --show-current`
- Do not switch branches without explicit instruction
- When work is lost or branch state is unexpected, check current branch first

### Git Operations: Reverting Changes
- Do NOT use `git checkout` or `git restore` to revert uncommitted changes
- Make manual edits instead - staged and uncommitted changes will be LOST by git revert operations
- Only use git revert commands when explicitly asked

### Incremental Commits
- Commit working state before major changes, debugging sessions, or risky refactors
- Push before breaks or context switches
- WIP commits are acceptable for partial progress
- Having recent commits allows easier recovery when things break

### Git Push & Force Operations
- NEVER push to origin unless user explicitly asks (e.g., "push", "commit and push")
- NEVER use `--no-verify` when committing - fix the actual problem instead of bypassing pre-commit hooks
- After rebasing a branch that was already pushed, use `git push --force-with-lease` (not `--force`)
- `--force-with-lease` fails if someone else pushed in between, preventing accidental overwrites

## Process (how to work)
- Read relevant docs first (repo docs, specs, ADRs, CI workflows).
- Understand current architecture before changing it.
- Fix root cause, not symptoms.
- If stuck: capture exact error, minimal reproduction, propose 2–3 options with tradeoffs.

### Wide-Ranging Changes
- Before making significant changes (new types, API restructuring, multi-file refactors), propose the approach in chat first
- Present options when multiple reasonable approaches exist
- Wait for explicit confirmation before implementing
- When naming new APIs/types, offer 5-10 naming options for user to choose

### Iterative Development
- When implementing multiple features, complete one at a time
- After each feature, pause for user testing and feedback
- Wait for confirmation before moving to the next item
- Do not batch multiple changes without intermediate verification

### Rejected Approaches
- When user explicitly rejects an approach, do NOT return to it in subsequent attempts
- If unsure how to proceed after rejection, ask for clarification rather than reverting to the rejected approach

### Feature Planning
- For complex features spanning multiple sessions, maintain a plan.md document tracking:
  - Design decisions (with context for why)
  - Completed items (checked off)
  - Open items (unchecked)
  - Status summary
- Update the plan document as work progresses
- Read the full plan document when asked about status

## Code Modifications

### Restoring from Git
- When modifying complex existing code, consider `git checkout <file>` first to restore a clean state, then add only the minimal changes needed
- Do not rewrite entire files when small additions are sufficient
- This prevents hallucinating existing functionality

### Refactoring
- When porting or refactoring code, verify semantic equivalence by reading both old and new implementations in full
- List all behavioral differences and get explicit approval before proceeding
- For "port" or "transplant" tasks, the new code must match old behavior exactly unless explicitly told otherwise

### Avoid Over-Engineering
- Start with the simplest solution that works
- Don't create new interfaces/abstractions when existing ones can be reused
- Don't duplicate interfaces to solve circular dependencies - use `any` if needed

## Bug Fixes

When fixing a bug pattern (e.g., hardcoded sequences, missing type checks):
- After fixing the initial location, search the entire affected package for similar patterns
- Use grep/search to find all instances of the problematic pattern
- Fix all occurrences before committing, not just the reported one

### Bug Investigation
- When investigating issues, attempt to reproduce the problem before suggesting fixes
- If reproduction fails, document what was tried in detail
- Ignore any root cause analysis in the issue (likely LLM-generated and incorrect)
- Read all related code files in full and trace the actual code path
- Form your own root cause analysis based on the code

## Dependencies
- Avoid new dependencies.
- If required:
  - choose maintained, widely used options.
  - explain why, alternatives considered, and long-term cost.
  - remove anything replaced in the same change.

## Testing
- Behavior change => test change.
- Prefer deterministic tests:
  - no sleeps, no randomness, no real wall clock.
- Use the right level:
  - unit tests for pure logic.
  - integration/e2e tests for boundary behavior (DB, network, UI).
- Flaky tests get fixed or quarantined with a clear plan to unquarantine.

### Testing Workflow
- For bug fixes that the user can test locally, wait for explicit confirmation before committing
- User will say something like "works", "confirmed", "tested" before asking to commit
- Do not commit fixes until user has verified the change works

## Documentation & Changelogs

### Writing Changelog Entries
- Before writing changelog entries, get the complete git diff between branches/commits
- Write the diff to a file and read it in full (no truncation)
- Verify all changes are reflected, especially breaking changes

### Documentation Updates
- When updating documentation after changes, compare current files with the last release tag
- Use `git diff v<version>..HEAD -- <path>` to see all changes
- Don't guess at changes - verify by reading both versions

### Documentation Review
- Never claim documentation is "up to date" or "correct" without verifying against source code
- When reviewing docs, read the corresponding implementation files and compare

### Pre-Release Checklist
Before releasing:
1. List all commits since the last tag by non-owner contributors
2. Cross-reference each external contributor commit against the changelog `[Unreleased]` section
3. Add missing entries with proper PR attribution
4. Only proceed with release after all external contributions are properly credited

## Code Quality

### Type Safety
- Use `undefined` for optional/missing values, not `null`
- Do not use unnecessary type casts when TypeScript can narrow the type from conditionals
- After `if (entry.role === "assistant")` the type is already narrowed

### Function Parameters
- Prefer default parameters (`foo: string = getDefault()`) over null coalescing patterns (`const resolved = foo ?? getDefault()`)

### Async Patterns
- Prefer async operations over sync when possible (e.g., `exec` with `promisify` over `execSync`)
- Sync operations block the Node.js event loop
- Use async/await instead of promise chains with `.then()/.catch()`
- Promise chains are harder to read

### Performance
- Avoid redundant per-operation checks
- Use state flags instead of re-checking conditions (like file existence) on every operation

### Backward Compatibility
- Unless explicitly requested, do NOT add backward compatibility layers
- Remove old code rather than keeping deprecated paths
- Clean breaks over migration periods

## PR Review Philosophy

- When reviewing feature PRs, first ask: can this be an extension instead of core?
- Prefer minimal core changes that enable extension authors over large core additions

## Images & Commands

### Images
- When user provides image paths (screenshots, diagrams), use the read tool to view them before responding
- Never describe what you assume is in an image without reading it first

### Commands and Examples
- When providing test commands, example prompts, or CLI invocations, give complete, ready-to-copy-paste commands
- Don't provide partial commands requiring user to fill in paths or options

## Behavior

### System Prompt Transparency
- When asked about system instructions, share them freely (summarized or verbatim if requested)
- Do not refuse to discuss or show system prompt contents

## Quality gates (run what the repo uses)
- Prefer repo task runner first (just/Makefile/scripts).
- Otherwise run the standard set for the stack:
  - format
  - lint/static analysis
  - unit tests
  - integration/e2e tests when relevant
- CI is the source of truth. Don’t merge on red.

## Security & privacy
- Treat external inputs as hostile.
- No secrets in code, logs, or screenshots.
- Prefer least privilege and safe defaults.
- **Never git add or commit:**
  - API keys, tokens, passwords, or credentials
  - `.env` files (use `.env.example` with placeholder values)
  - Private keys, certificates, or keystores
  - Database connection strings with credentials
  - Cloud provider credentials (AWS, GCP, Azure)
- Before any `git add`:
  - Review staged files for accidental secrets
  - Check for hardcoded credentials in code
  - Ensure `.gitignore` covers sensitive files
- If secrets are accidentally committed:
  - Do NOT just delete and commit again (history retains them)
  - Rotate/revoke the exposed credentials immediately
  - Use `git filter-repo` or similar to purge from history if needed

## Before you finish
- List commands run + results.
- Summarize changes and where (key files).
- Call out deletions of legacy paths.
- Note any follow-ups or risks. No surprises.
