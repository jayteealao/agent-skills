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
