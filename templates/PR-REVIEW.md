# PR Review Template

For each PR URL, do the following in order:

1. Read the PR page in full. Include description, all comments, all commits, and all changed files.
2. Identify any linked issues referenced in the PR body, comments, commit messages, or cross links. Read each issue in full.
3. Analyze the PR diff. Read all relevant code files in full with no truncation. Include related code paths.
4. Check for a changelog entry in relevant `packages/*/CHANGELOG.md` files. Report whether an entry exists. If missing, state that a changelog entry is required before merge.
5. Check if README.md, docs/*.md require modification for new/changed features.
6. Provide a structured review: Good, Bad, Ugly
7. Add Questions or Assumptions if anything is unclear.
8. Add Change summary and Tests.

## Output Format

```
PR: <url>
Changelog: <status>

Good:
- <bullet list>

Bad:
- <bullet list>

Ugly:
- <bullet list>

Questions or Assumptions:
- <bullet list>

Change summary:
- <bullet list>

Tests: <status>
```
