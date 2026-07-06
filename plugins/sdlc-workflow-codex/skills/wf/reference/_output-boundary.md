# External Output Boundary (MANDATORY)

This file is the ONE canonical statement of the boundary rule. Every stage reference, skill, and
sub-agent prompt cites it instead of restating it — a conventions test fails the build if the full
rule body appears anywhere else under `skills/`.

## The rule

Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.

**Internal — a predicate, not a path list:**
- Any file under `.ai/**` or `.codex/**`. Workflow artifacts, registries, control files, ship
  plans, dep-updates, ideation, simplify runs, solutions — every current and *future* subdirectory
  of those roots is covered by construction; do not enumerate paths when citing this rule.
- Workflow vocabulary: stage names or numbers, skill names, task/sub-agent names,
  prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.

**External-facing:**
- Commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries,
  user documentation, README content, code comments/docstrings, issue comments, deployment
  notes — and any file outside the internal roots above.

**Translate, don't cite:**
- When producing external-facing output, translate workflow context into product/project language:
  user-visible change, rationale, affected areas, verification, risks, migration notes, and
  follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.

**Leak check before publishing:**
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing
  anything, perform a leak check and remove internal workflow references unless the user
  explicitly asks for a private/internal artifact.

## Scope notes

- The **chat return** at the end of a `wf-*` invocation is an internal audience — `.ai/` paths are
  allowed there. The boundary governs what leaves the session: commits, PRs, releases, docs, code.
- Sub-agents spawned with fresh context do NOT inherit this rule automatically; dispatcher prompts
  re-assert a compressed form of it. That compressed restatement is the only sanctioned duplication.
