# CLAUDE.md — TypeScript repo (strict, clear, production)

Start: say hi. One motivating line. Then work.

## Owner / contact
- Owner: <FILL ME> (name, handle, email).

## Style goals (always)
- Simple, clear, readable. Production-grade.
- Prefer explicit code over clever tricks.
- Small functions, clear names, clear data flow.
- Keep types honest. Delete dead code. One source of truth.

## Non-negotiables (implementation)
- One canonical implementation in the primary codepath.
  - Remove legacy/shims/adapters in the same change.
  - No compatibility wrappers.
- Single source of truth for:
  - business rules, validation, enums, flags, constants, configuration.
- If frontend: UI thin view layer. Business rules live in domain/shared layer.
- Validate and sanitize all user-controlled input before OS/file/process/eval.
- Errors are explicit:
  - no silent catches.
  - user-visible error states where appropriate.
  - logs have context, no secrets.

## Workflow
- No git worktrees unless user asks.
  - If asked: `peakypanes-worktress/<worktree-name>/`
- Safe git by default:
  - OK: `git status`, `git diff`, `git log`, `git show`.
  - No destructive ops unless explicit.
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

## Type system rules
- `tsconfig` strict (honor repo config).
- No `any`. Ever.
  - Use `unknown` at boundaries, then validate/parse.
- Avoid `as` assertions.
  - If unavoidable, localize to a boundary and justify with a comment.
- Prefer discriminated unions, enums, and branded types for closed domains.

## Runtime / package manager
- Use the repo’s package manager (pnpm/npm/yarn/bun). No swaps without approval.
- Prefer repo scripts, `just`, or `Makefile` targets when present.

## Validation & boundaries
- External data must be validated:
  - API payloads, env vars, query params, storage, file contents.
  - Use the repo’s validator (zod/io-ts/custom). Don’t add a second validation stack.
- Network calls:
  - timeouts/aborts. No hanging promises.

## Dependencies
- Avoid new deps.
- If required:
  - pick maintained + widely used.
  - explain why and remove anything replaced in the same change.

## Testing
- Behavior change => test change.
- Unit tests: fast, deterministic.
- Integration/e2e for cross-boundary behavior (API, DB, browser).
- No flaky sleeps. Use proper waits/fake timers.

### Testing Workflow
- For bug fixes that the user can test locally, wait for explicit confirmation before committing
- User will say something like "works", "confirmed", "tested" before asking to commit
- Do not commit fixes until user has verified the change works

### Test Configuration (TypeScript)
- All network-dependent tests should have `{ retry: 3 }` configuration for flaky API calls
- Remove explicit timeouts from tests that use retries (default is sufficient)

### Test Provider Consistency
- When adding provider tests, ensure ALL OAuth providers have the same test cases
- Each provider should have consistent test coverage (same number of tests, same scenarios)

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

### TypeScript-Specific Code Style
- Use top-level await in TypeScript
- Do NOT wrap code in `async function main() { ... } main().catch(console.error)` patterns
- Do NOT use section divider comments like `// === Section Name ===` or `// ============`
- Use normal comments if explanation is needed

### TypeScript Examples
- Example files in `examples/` directories must import from published package names (e.g., `@mariozechner/pi-coding-agent`), not relative paths like `../../src/`
- This ensures examples match what users would write
- Put examples in subdirectories under `examples/`
- One file per example, not one huge file with everything
- Add README.md to example directories explaining each example

## TypeScript-Specific Rules

### TypeBox Schema Rules
- NEVER use `Type.Union([Type.Literal("a"), Type.Literal("b")])` for string enums
- Use `StringEnum` from `@mariozechner/pi-ai` instead (required for Google API compatibility)

### Data Structure Traversal
- Use iterative approaches (stack/queue) instead of recursion for tree/graph traversal
- Session trees can have 8000+ entries - recursion will overflow the stack
- Convert recursive functions to iterative when dealing with user-generated data

### Mode-Specific Behavior
- Never print debug/timing output in RPC mode (breaks JSON parsing for clients)
- Limit diagnostic output to interactive mode only

## TUI Code Rules

### Console Output
- NEVER use `console.log` or `console.error` in interactive-mode.ts or TUI components
- Use TUI-safe methods instead (e.g., `showError()`, `showToolError()`)
- Console output breaks TUI rendering

### Width Constraints
- TUI crashes if any rendered line exceeds terminal width
- Use `truncateToWidth(line, width)` on every line before returning from `render()`
- Replace tab characters with spaces (tabs render as multiple characters)
- Use `visibleWidth()` to calculate actual display width (handles ANSI codes)

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
- Prefer repo scripts. Otherwise typical:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck` (or `tsc -p tsconfig.json`)

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
  - `node_modules/` or lock files with inline credentials
- Before any `git add`:
  - Review staged files for accidental secrets
  - Check for hardcoded credentials in code
  - Ensure `.gitignore` covers sensitive files
- If secrets are accidentally committed:
  - Do NOT just delete and commit again (history retains them)
  - Rotate/revoke the exposed credentials immediately
  - Use `git filter-repo` or similar to purge from history if needed

## Before you finish
- Commands run + results listed.
- Legacy paths removed. No parallel implementations.
- Rules/validation centralized.
- Clear summary. Key files noted.
