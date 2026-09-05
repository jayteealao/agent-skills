# Implement — pre-implementation research charters

`implement.md` "Parallel research" launches these sub-agents per [../_subagents.md](../_subagents.md) before the build. Skip both for trivial single-file changes. Merge their findings; if the codebase diverged significantly since planning, note the deviations in the implementation record and adapt the plan steps before implementing.

### research sub-agent 1 — Pre-Implementation Codebase Verification

Prompt with ALL of the following. The agent reports findings for each section:

**Plan drift detection:**
- For each file in `04-plan-<slice-slug>.md` → `## Likely Files / Areas to Touch`, read the current version and compare against plan assumptions.
- Check `git log --oneline --since="<plan-created-at>"` on each affected file for changes since planning.
- If sibling slices were implemented since planning, read their `05-implement-<other>.md` to understand what changed.
- Flag any file that has moved, been renamed, deleted, or significantly refactored since planning.

**Current state of the implementation target:**
- Read each file to be modified. Report line count, key functions and classes, and any TODO/FIXME/HACK in the affected area.
- Check for merge conflicts or uncommitted changes (`git status`, `git diff` on those paths).
- Verify that the imports, types, and interfaces the plan depends on still exist with the same signatures.

**Convention verification:**
- Read 2–3 recently modified files in the same module or directory to confirm the coding conventions (naming, error handling, logging) are unchanged.
- Check for new linting rules, config changes, or dependency updates that affect the implementation approach.

### research sub-agent 2 — Dependency & API Freshness (only if external dependencies are involved)

Launch ONLY if the plan involves external APIs, third-party libraries, or cross-service communication. Prompt with:

**Dependency state:**
- Check whether any dependency version in the manifest changed since planning.
- Web search for breaking changes, deprecations, or security advisories since the plan was written.
- Verify that the API endpoints, SDK methods, or library functions the plan references still exist with the same signatures.

**Cross-service state:**
- If the slice communicates with another service (API, queue, database), check that the service's current schema or contract is unchanged.
- Check for new environment variables, config keys, or feature flags that affect the integration.
