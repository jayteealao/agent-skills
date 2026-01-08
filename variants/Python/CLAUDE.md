# CLAUDE.md — Python repo (strict, clear, production)

Start: say hi. One motivating line. Then work.

## Owner / contact
- Owner: <FILL ME> (name, handle, email).

## Style goals (always)
- Simple, clear, readable. Production-grade.
- Prefer explicit code over clever tricks.
- Small functions, clear names, clear data flow.
- One obvious way to do it in this repo, keep it consistent.
- Delete dead code, remove duplication, keep one source of truth.

## Non-negotiables (implementation)
- One canonical implementation in the primary codepath.
  - Remove legacy/shims/adapters in the same change.
  - No compatibility wrappers.
- Single source of truth for:
  - business rules, validation, enums, flags, constants, configuration.
- Validate and sanitize all user-controlled inputs before OS/file/subprocess calls.
- Errors are explicit:
  - no silent catches.
  - raise/return errors with context.
  - logs have context, no secrets.

## Workflow
- No git worktrees unless user asks.
  - If asked: `peakypanes-worktress/<worktree-name>/`
- Safe git by default:
  - OK: `git status`, `git diff`, `git log`, `git show`.
  - No destructive ops unless explicit.
  - No amend unless asked.
- Small commits. Reviewable diffs. No repo-wide reformat.

## Environment (Python)
- Prefer `uv` + local `.venv`.
  - Init: `uv init`
  - Create venv: `uv venv`
  - Install/sync: `uv sync`
  - Add deps: `uv add`
  - Run tools: `uv run <cmd>`
  - 
- Use `uv pip ...` compatibility only when a project truly requires pip-style flows.
  - Otherwise avoid. Don’t introduce Poetry/requirements.txt unless asked.

## Architecture
- Keep domain rules centralized (one place).
- Strong types:
  - type hints everywhere practical.
  - explicit models (dataclasses / pydantic / repo standard).
- Avoid global state. Pass config/context explicitly.
- I/O boundaries explicit (db/network/fs). Timeouts at edges.

## Dependencies
- Avoid new deps.
- If required:
  - pick maintained + widely used.
  - explain why and remove anything replaced in the same change.

## Testing
- Behavior change => test change.
- Unit tests: fast, deterministic, no network, no wall-clock sleeps.
- Integration tests: real boundaries when needed, tagged per repo convention.
- Prefer fixtures/factories over brittle mocks.

## Quality gates (run what the repo uses)
- Prefer repo runner (just/Makefile/nox/tox). Otherwise typical:
  - `uv run pytest`
  - `uv run ruff check .` (or repo linter)
  - `uv run mypy .` (if configured)

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
  - `secrets.py`, `config.local.py`, or similar local config files
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
- Inputs validated before OS/subprocess usage.
- Clear summary. Key files noted.
