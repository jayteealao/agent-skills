---
name: review-ci
description: "Review CI/CD pipelines for security, correctness, and deployment safety"
---

# review-ci

This generated skill is a Codex adapter for the canonical workflow command source. Keep the Claude command source as the single source of truth; do not copy command logic into this generated file.

## When To Use

Use this skill when the user asks for `/review-ci`, references `commands/review/ci.md`, or describes the same workflow intent.

## Runtime Procedure

1. Read the canonical source before acting.
2. Follow the canonical source as the workflow contract.
3. Apply the external output boundary below before producing commits, PRs, documentation, code comments, release notes, or any other external-facing output.
4. Apply the Codex compatibility rules below before executing any step.
5. If the source conflicts with current Codex runtime rules, follow the active Codex runtime rules and note the adaptation in the result.

## Canonical Source

- ../../../commands/review/ci.md

## External Output Boundary

Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.

- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

## Codex Compatibility Rules

- Do not copy Claude-only command frontmatter keys such as `disable-model-invocation`, `allowed-tools`, `argument-hint`, or `user-invocable` into generated Codex skill frontmatter. Codex skill frontmatter supports `name` and `description` here.
- Use Claude `args` frontmatter as argument guidance from the canonical source, not as Codex skill metadata.
- Resolve `${CLAUDE_PLUGIN_ROOT}` to the plugin root that contains this generated adapter.
- Treat mentions of Claude slash commands as requests to run the equivalent generated Codex skill with the same workflow intent.
- Interpret `SESSION_SLUG` as the workflow slug under `.ai/workflows/`.
- Translate structured user-question tool references into concise plain-text questions in chat.
- Translate Claude task-tracking API references into Codex plan/progress tracking or concise local state.
- Use the current Codex model/runtime. Do not request Claude-specific model names.
- When the canonical source asks for parallel sub-agents, dispatch them in parallel. Codex supports concurrent sub-agent dispatch; do not serialize work that the source intends to fan out.

## Path Mappings

| Claude source path | Codex runtime path |
|---|---|
| `.claude/README.md` | `.ai/workflows/` |
| `.claude/<SESSION_SLUG>/README.md` | `.ai/workflows/<slug>/00-index.md` |
| `.claude/{SESSION_SLUG}/README.md` | `.ai/workflows/<slug>/00-index.md` |
| `.claude/<SESSION_SLUG>/reviews/review-*.md` | `.ai/workflows/<slug>/07-review-*.md` |
| `.claude/{SESSION_SLUG}/reviews/review-*.md` | `.ai/workflows/<slug>/07-review-*.md` |
| `.claude/<SESSION_SLUG>/reviews/` | `.ai/workflows/<slug>/` |
| `.claude/{SESSION_SLUG}/reviews/` | `.ai/workflows/<slug>/` |
| `.claude/<SESSION_SLUG>/` | `.ai/workflows/<slug>/` |
| `.claude/{SESSION_SLUG}/` | `.ai/workflows/<slug>/` |
