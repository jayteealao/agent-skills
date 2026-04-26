---
name: wf-plan
description: "Create or review-and-fix implementation plans. First invocation creates plans. Re-invocation auto-reviews against current codebase and artifacts, fixes issues found. Supports single slice, all slices (parallel), or explicit feedback."
---

# wf-plan

This generated skill is a Codex adapter for the canonical workflow command source. Keep the Claude command source as the single source of truth; do not copy command logic into this generated file.

## When To Use

Use this skill when the user asks for `/wf-plan`, references `commands/wf-plan.md`, or describes the same workflow intent.

## Runtime Procedure

1. Read the canonical source before acting.
2. Follow the canonical source as the workflow contract.
3. Apply the Codex compatibility rules below before executing any step.
4. If the source conflicts with current Codex runtime rules, follow the active Codex runtime rules and note the adaptation in the result.

## Canonical Source

- ../../../commands/wf-plan.md

## Codex Compatibility Rules

- Do not copy Claude-only command frontmatter keys such as `disable-model-invocation`, `allowed-tools`, `argument-hint`, or `user-invocable` into generated Codex skill frontmatter. Codex skill frontmatter supports `name` and `description` here.
- Use Claude `args` frontmatter as argument guidance from the canonical source, not as Codex skill metadata.
- Resolve `${CLAUDE_PLUGIN_ROOT}` to the plugin root that contains this generated adapter.
- Treat mentions of Claude slash commands as requests to run the equivalent generated Codex skill with the same workflow intent.
- Interpret `SESSION_SLUG` as the workflow slug under `.ai/workflows/`.
- Translate structured user-question tool references into concise plain-text questions in chat.
- Translate Claude task-tracking API references into Codex plan/progress tracking or concise local state.
- Use the current Codex model/runtime. Do not request Claude-specific model names.
- Follow current Codex delegation rules. If source text requests parallel sub-agents but delegation is unavailable or not permitted, perform the review steps locally or sequentially and state that adaptation.

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
