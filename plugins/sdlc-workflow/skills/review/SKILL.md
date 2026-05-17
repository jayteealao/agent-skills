---
name: review
description: Code review across 31 dimensions (correctness, security, performance, architecture, accessibility, supply-chain, and more — see `argument-hint`). `/review <dimension>` runs one rubric inline; `/review sweep <aggregate>` fans out one reviewer sub-agent per dimension in parallel and synthesizes a unified verdict. Auto-trigger on review or audit requests scoped to a PR, worktree, diff, file, or repo.
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **code review skill** for the SDLC workflow plugin. Two modes of operation:

- **Single-dimension** — `/review <dimension>` (e.g. `/review security pr 123`): read one reference file and execute its rubric inline.
- **Sweep** — `/review sweep <aggregate>` (e.g. `/review sweep architecture worktree`): dispatch one reviewer sub-agent per dimension in the aggregate's composition, collect findings in parallel, synthesize a unified verdict.

**Choosing between them:** single-dimension is one reviewer over a broad rubric; sweep is N reviewers each with their own rubric. Use single-dimension when you know which axis to investigate; use sweep when you want defensive breadth. Sweep is more thorough and more expensive — pick it deliberately.

# Step 0 — Resolve the request

Parse the user's invocation. Extract:

- **mode**: `single-dimension` or `sweep`
- **key**: the dimension key (single mode) or aggregate key (sweep mode)
- **scope**: `pr` / `worktree` / `diff` / `file` / `repo`
- **target**: PR URL or number, commit range, file path, etc.
- **paths**: optional file glob filter

Mode resolution rules:

- If the first positional token is the literal word **`sweep`**, mode is `sweep` and the next token is the **aggregate key**.
- Otherwise, the first non-scope token is treated as a **dimension key** (single-dimension mode).
- If no key is found, render the menu (below) and ask the user which review they want.
- Three names exist as both a dimension and an aggregate (`architecture`, `infra`, `security`). The dimension wins on a bare invocation; use `/review sweep <name>` to reach the aggregate.

**Aggregate keys** — resolved at runtime via `${CLAUDE_PLUGIN_ROOT}/skills/review/router-metadata.json` `aggregates.<key>`:

| Aggregate | What it dispatches (one sub-agent per dimension) |
|---|---|
| `all` | Every dimension (~31 sub-agents — broadest sweep, most expensive) |
| `architecture` | architecture, performance, scalability, api-contracts |
| `infra` | infra, ci, release, migrations, logging, observability |
| `pre-merge` | correctness, testing, security, refactor-safety, maintainability |
| `quick` | correctness, style-consistency, dx, ux-copy, overengineering |
| `security` | security, privacy, infra-security, data-integrity, supply-chain |
| `ux` | accessibility, frontend-accessibility, frontend-performance, ux-copy |

**Dimension keys** — each resolves to `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<key>.md`:

`accessibility`, `api-contracts`, `architecture`, `backend-concurrency`, `ci`, `code-simplification`, `correctness`, `cost`, `data-integrity`, `docs`, `dx`, `frontend-accessibility`, `frontend-performance`, `infra`, `infra-security`, `logging`, `maintainability`, `migrations`, `observability`, `overengineering`, `performance`, `privacy`, `refactor-safety`, `release`, `reliability`, `scalability`, `security`, `style-consistency`, `supply-chain`, `testing`, `ux-copy`.

# Step 1a — Single-dimension execution

1. Read the reference file in full from `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<key>.md`.
2. Treat its content as your instructions for this invocation. Do not summarize, paraphrase, or skip — follow it verbatim.
3. The reference's `args:` frontmatter describes how it consumes scope/target/paths/session-slug.
4. When a workflow slice is active, write findings to `.ai/workflows/<slug>/07-review-<slice>-<dimension>.md` per the v8.30 per-slice review contract.

# Step 1b — Sweep execution (parallel sub-agent dispatch)

1. **Resolve the composition.** Read `${CLAUDE_PLUGIN_ROOT}/skills/review/router-metadata.json` and look up `aggregates.<aggregate-key>` to get the array of dimension keys to dispatch.

2. **Prepare one Task invocation per dimension.** For each dimension key D in the composition:
   - `subagent_type`: `general-purpose`
   - `model`: resolve from `router-metadata.json` `models` block — `models.overrides[D]` if present, otherwise `models.default`. Pass the resolved value (`"haiku"` or `"sonnet"`) as the Task tool's `model` parameter. Do not omit this; reviewers must not silently inherit the parent's model.
   - `description`: `"review-{D}"` (3-5 words, satisfies the Task tool's description constraint)
   - `prompt`: a self-contained prompt assembled as:
     1. The dimension reference body (read from `skills/review/reference/{D}.md`).
     2. Concrete scope context: scope mode, target, paths, session slug.
     3. Output instruction: produce findings in the standard schema (severity + confidence + file:line + evidence + suggested fix).
     4. Artifact instruction: when a workflow slice is active, write `.ai/workflows/<slug>/07-review-<slice>-{D}.md` with the findings; otherwise return them inline only.

   **Why the model split.** Rubric-bound dimensions (the default) run on Haiku 4.5: bounded input, fixed output schema, no cross-dimension reasoning needed — Haiku follows the schema cleanly at a fraction of the cost. The three `overrides` (`architecture`, `refactor-safety`, `security`) call for subjective tradeoff judgment, abstraction critique, or threat modeling, so they get Sonnet 4.6. Synthesis (Step 5 below) keeps the parent model — cross-finding dedup, severity-scale mapping, and interactive triage benefit from the stronger reasoner.

3. **Dispatch in parallel.** Issue ONE assistant message containing all N `Task` tool calls. Sequential dispatch defeats the purpose of sweep mode and is forbidden.

4. **Wait for all sub-agents to return.** Do not begin synthesis until every dispatched sub-agent has completed (or timed out).

5. **Synthesize** the sub-agent outputs:
   - **Collect** each sub-agent's findings list.
   - **Deduplicate** by `(file:line + root cause)`. When two dimensions flag the same root issue, keep the most specific severity and merge the rationales into one finding tagged with both dimension names.
   - **Normalize** severity to `BLOCKER` / `HIGH` / `MED` / `LOW` / `NIT`. If a sub-agent used a different scale (Critical/Major/Minor, P0/P1/P2/P3, Blocker/Major/Trivial), map onto the canonical five-level scale before merging.
   - **Triage** all `BLOCKER` and `HIGH` findings interactively with the user via `AskUserQuestion`. For each, present finding text + impact + suggested fix; let the user accept (will fix), defer (acknowledge but ship), or reject (false positive).
   - **Determine the verdict**:
     - `Ship` — no `BLOCKER`, no `HIGH`
     - `Ship with caveats` — `HIGH` only (no `BLOCKER`)
     - `Don't ship` — any `BLOCKER`
   - **Write the master artifact** when a workflow slice is active: `.ai/workflows/<slug>/07-review-<slice>.md` with verdict, all metric counts, the deduplicated finding list, and triage decisions.

# Step 2 — Output to the user

Whether single-dimension or sweep, the final user-visible output:

```markdown
# {Single-dimension | Sweep} Review — {key}

**Verdict:** {Ship / Ship with caveats / Don't ship}
**Reviewed:** {scope} / {target}
**Files:** {N} changed, +{lines} -{lines}

## Findings ({total})
BLOCKER: {n} | HIGH: {n} | MED: {n} | LOW: {n} | NIT: {n}

## Critical (BLOCKER + HIGH)
[finding details — file:line, evidence, suggested fix, dimension(s) that flagged it]

## Other findings
[grouped by severity, then by dimension]

## Triage decisions
[what the user accepted, deferred, or rejected — sweep mode only]
```
