---
name: review
description: Code review router. /review <dimension> for a per-dimension review (security, correctness, architecture, performance, scalability, accessibility, observability, …). /review pass <aggregate> for a multi-dimension pass (all, architecture, infra, pre-merge, quick, security, ux). 31 dimensions, 7 aggregates.
argument-hint: "[pass <aggregate> | <dimension>] [scope] [target]"
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `review`, the **code review router** for the SDLC workflow plugin.

# What this command does

Routes to a per-dimension review or a multi-dimension aggregate pass. The reference body for each subcommand lives at `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/`. This file is a thin router: it parses the first positional token, loads the matching reference, and then follows that reference's instructions verbatim.

# Step 0 — Resolve the subcommand

Parse `$ARGUMENTS`. The **first positional token** determines the subcommand:

- If the first token is `pass`, the **second token is an aggregate key** and the rest is the scope/target. Reference: `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/_aggregate-<key>.md`.
- Otherwise, the first token is a **dimension key** and the rest is the scope/target. Reference: `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<key>.md`.
- If `$ARGUMENTS` is empty, render the menu below and ask the user which review they want.

**Aggregate keys** (loaded as `_aggregate-<key>.md`):

| Key | Purpose |
|---|---|
| `all` | All 30 review dimensions in a single thorough pass |
| `architecture` | Architecture + performance + scalability + API contracts |
| `infra` | Deployment + CI/CD + release + migrations + logging + observability |
| `pre-merge` | Correctness + testing + security + refactor safety + maintainability |
| `quick` | Compressed multi-dimension pass for fast feedback |
| `security` | Security + privacy + supply chain + infra-security |
| `ux` | UX copy + accessibility + frontend accessibility + frontend performance + style consistency |

**Dimension keys** (loaded as `<key>.md`):

`accessibility`, `api-contracts`, `architecture`, `backend-concurrency`, `ci`, `code-simplification`, `correctness`, `cost`, `data-integrity`, `docs`, `dx`, `frontend-accessibility`, `frontend-performance`, `infra`, `infra-security`, `logging`, `maintainability`, `migrations`, `observability`, `overengineering`, `performance`, `privacy`, `refactor-safety`, `release`, `reliability`, `scalability`, `security`, `style-consistency`, `supply-chain`, `testing`, `ux-copy`.

When the dimension key collides with an aggregate (`architecture`, `infra`, `security`), the dimension wins on a bare `/review <name>` invocation. Use `/review pass <name>` to reach the aggregate.

# Step 1 — Load the reference

1. Resolve the reference path from the rules above.
2. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<file>`.
3. Treat the reference's content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.

# Step 2 — Pass the remaining arguments

Whatever tokens remain after the matched subcommand keyword(s) are the scope/target/paths. Pass them through to the reference unchanged. The reference's `args:` frontmatter (preserved from the original command) describes how it consumes them — typically `SESSION_SLUG`, `SCOPE`, `TARGET`, `PATHS`, in positional order.

# Routing summary

```
/review                            -> render menu, ask
/review <dim>                      -> reference/<dim>.md
/review <dim> <args...>            -> reference/<dim>.md, with <args...> forwarded
/review pass <agg>                 -> reference/_aggregate-<agg>.md
/review pass <agg> <args...>       -> reference/_aggregate-<agg>.md, with <args...> forwarded
```

# Notes

- Pinned shims for the previous commands (`/review-all`, `/review-architecture`, `/review:security`, ...) live alongside this router and redirect here unchanged. Existing docs and macros that reference the old slash commands continue to work.
- The full per-router metadata (every shim's old path, kind, key, description) is at `${CLAUDE_PLUGIN_ROOT}/skills/review/router-metadata.json`. The verifier `scripts/verify-router-migration.mjs` checks that every reference's body and every shim's frontmatter agree with the migration manifest.
