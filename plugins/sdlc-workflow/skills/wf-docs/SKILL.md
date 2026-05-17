---
name: wf-docs
description: Documentation router. Orchestrator mode runs the full discover → audit → plan → generate → review pipeline against a project or workflow slug. Primitive mode writes a single Diátaxis document — tutorial, how-to, reference, explanation, or readme — or runs a docs review.
disable-model-invocation: true
argument-hint: "[plan|tutorial|how-to|reference|explanation|readme|review|<slug>|--audit-only|<path>] [target]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **documentation dispatcher** for the SDLC plugin. Two modes of operation:

- **Orchestrator** (`/wf-docs`, `/wf-docs <slug>`, `/wf-docs --audit-only`, `/wf-docs <path>`) — run the full pipeline. Discover existing docs, audit them against the codebase and Diátaxis principles, plan what to create/update/remove, generate using the appropriate primitive references, and spot-review the output.
- **Primitive** (`/wf-docs <primitive> <args>`) — load one Diátaxis reference and write a single document. The primitive is responsible for its own quadrant discipline; this skill simply loads and follows the matching `reference/<primitive>.md`.

# Step 0 — Mode + sub-command resolution (MANDATORY)

Parse `$ARGUMENTS`.

**Known primitive keys**: `plan`, `tutorial`, `how-to`, `reference`, `explanation`, `readme`, `review`.

**Resolution logic**:

1. **If the first positional token matches a known primitive key** → **Primitive mode**. Sub-command = that key. Remaining tokens become the primitive's `$ARGUMENTS`. Skip Steps 1–5 below; jump to Step 6.

2. **Otherwise** → **Orchestrator mode**. Parse the args as the orchestrator inputs:
   - No argument → `mode: project`, scope is entire project.
   - Argument is `--audit-only` → `mode: project`, `audit-only: true`.
   - Argument matches an existing `.ai/workflows/<slug>/00-index.md` → `mode: workflow`, `target-slug: <slug>`.
   - Argument is a path (resolves to an existing directory or file) → `mode: path`, `scope-path: <path>`.
   - Argument is none of the above → STOP. *"`<token>` is not a recognized primitive, slug, path, or flag. Run `/wf-docs` with no arguments for full-project audit, or pick one of: plan, tutorial, how-to, reference, explanation, readme, review."*

3. **Generate run ID** for orchestrator mode: `docs-<YYYYMMDD-HHMM>` (run `date +"%Y%m%d-%H%M"` via Bash).

4. **For `mode: workflow`**: read the workflow's index and all stage artifacts to understand what changed. Pay special attention to `02-shape.md` → `## Documentation Plan` (the Diátaxis doc plan written at shape).

# CRITICAL — execution discipline (orchestrator mode)
You are a **documentation orchestrator**. You are not a writer operating in isolation.
- Do NOT generate docs without first auditing what already exists — creating duplicate content is worse than a gap.
- Do NOT write docs in the wrong Diátaxis quadrant. A reference page must not contain opinion. A tutorial must build something. A how-to must be goal-oriented. An explanation must not contain steps.
- Do NOT modify source code while generating docs. Documentation lives in markdown files.
- Do NOT delete or overwrite existing documentation without explicitly noting the deletion in the plan and confirming with the user.
- For `mode: workflow`: read the actual workflow artifacts (`02-shape.md`, `03-slice.md`, `08-handoff.md`) to understand what was built before writing anything.
- Follow the numbered steps exactly in order.

# Step 1 — Discover (orchestrator only)
Find all existing documentation in scope.

Launch one Explore sub-agent with the following:

**Documentation inventory:**
- Find all markdown files in the project: `README.md`, `docs/`, `CONTRIBUTING.md`, `CHANGELOG.md`, `wiki/`, API docs, embedded docstrings, and any other `.md` files
- For each file found: record the path, file size, last modified date (`git log -1 --format="%ai" -- <file>`), and a one-sentence description of what it covers
- Identify the documentation structure: is there a `docs/` folder? A wiki? API reference generation from code? A static site (Docusaurus, MkDocs, Jekyll, VitePress)?
- For `mode: workflow`: identify which docs were listed in the shape's `## Documentation Plan` — check which exist vs which are missing
- For `mode: path`: scope all searches to `<scope-path>`
- List any documentation generation tooling: `typedoc`, `sphinx`, `godoc`, `rustdoc`, `jsdoc`

Write `discover.md` with the full inventory.

**`discover.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: docs-discover
run-id: <run-id>
mode: <project|workflow|path>
target-slug: <slug or "n/a">
scope: <description>
doc-files-found: <count>
has-docs-folder: <true|false>
doc-generator: <tool or "none">
status: complete
created-at: <real timestamp via bash>
---
```

# Step 2 — Audit (orchestrator only)
For each documentation file found, audit it against the codebase and Diátaxis principles. Launch parallel Explore sub-agents — one per documentation area or one per large doc file.

**Each audit sub-agent is prompted with:**

For the assigned documentation file(s):

**Accuracy vs. codebase:**
- Read the doc. For every code example, API name, function signature, config key, CLI command, and endpoint mentioned — verify it still exists and has the same signature in the current codebase
- Check if the doc references files, modules, or paths that have moved or been deleted (`git log --all --follow -- <old-path>`)
- Note outdated version numbers, deprecated options, or removed features still documented

**Diátaxis quadrant check:**
- Classify the document: tutorial (learning-oriented, builds something), how-to (task-oriented, goal-driven steps), reference (information-oriented, neutral and scannable), explanation (understanding-oriented, discusses why)
- Does the document match its stated type? Common violations: a reference page that gives opinions, a tutorial that doesn't actually build something, an explanation that contains numbered steps, a how-to that explains why instead of showing how
- Is the document doing the job of TWO quadrants? If so, it should be split

**Completeness check:**
- Are there public APIs, config options, CLI flags, or user-facing behaviors that exist in the code but are NOT documented anywhere?
- For `mode: workflow`: compare the workflow's implementation artifacts against the existing docs — what did the feature add that's missing?

**Freshness:**
- When was this doc last meaningfully updated (`git log -5 --format="%ai %s" -- <file>`)? When was the related code last changed?
- Is the gap between doc age and code age more than 30 days?

Each sub-agent returns: file path, accuracy issues (list), quadrant violations (list), gaps (list), last-updated, freshness-risk (low/medium/high).

Write `audit.md` aggregating all sub-agent findings.

**`audit.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: docs-audit
run-id: <run-id>
files-audited: <count>
accuracy-issues: <count>
quadrant-violations: <count>
gaps-found: <count>
high-freshness-risk: <count>
status: complete
created-at: <real timestamp>
---
```

**`audit.md` body — one section per file:**
```
## <file-path>
- Type: <tutorial|how-to|reference|explanation|readme|unknown>
- Accuracy issues: <list or "none">
- Quadrant violations: <list or "none">
- Gaps: <list or "none">
- Freshness risk: <low|medium|high>
- Action needed: <update|rewrite|split|create|delete|none>
```

# Step 3 — Plan (orchestrator only)
Synthesize the audit into a prioritized action plan. Write `plan.md`.

**Priority tiers:**

| Tier | Condition |
|------|-----------|
| **P0 — Broken** | Accuracy issues — docs reference non-existent code, wrong signatures, deleted paths |
| **P1 — Missing** | Gaps — public APIs or user behaviors with no docs at all |
| **P2 — Wrong quadrant** | Quadrant violations that actively mislead readers |
| **P3 — Stale** | High freshness risk — code changed significantly since last doc update |
| **P4 — Enhancement** | Low-priority improvements, polish, structural improvements |

For each action:
- Action type: `create` | `update` | `rewrite` | `split` | `delete`
- Target file path (new or existing)
- Diátaxis primitive to invoke: `tutorial` | `how-to` | `reference` | `explanation` | `readme`
- Scope: what specifically to write or change (2–4 sentences)
- Required reading: which source files or workflow artifacts the writer must read first

If the audit surfaced ambiguous classifications (a doc that mixes quadrants, or a request that could be tutorial-or-how-to), load `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/plan.md` to apply the Diátaxis decision table before recording the action.

**`plan.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: docs-plan
run-id: <run-id>
p0-count: <count>
p1-count: <count>
p2-count: <count>
p3-count: <count>
p4-count: <count>
total-actions: <count>
audit-only: <true|false>
status: complete
created-at: <real timestamp>
---
```

If `audit-only: true` → **STOP HERE**. Present the plan in chat. Do not proceed to Step 4.

**After writing:** Present a summary and confirm with user:
```
AskUserQuestion:
  question: "Documentation plan ready: P0 broken=<N>, P1 missing=<N>, P2 wrong-quadrant=<N>. Proceed with generation?"
  options:
    - Generate all planned docs
    - Generate P0 and P1 only (skip P2–P4)
    - Audit-only — save plan, do not write docs
    - Adjust plan (describe changes)
```

# Step 4 — Generate (orchestrator only)
Execute the plan in priority order.

For each action, sequentially:

1. **TaskCreate** the action: `"<action-type> <file-path>"`.
2. **Read required source files** before writing anything — do not write from memory.
3. **Load the matching primitive reference** from `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/<primitive>.md` and follow it verbatim. The primitive references are:
   - `reference/tutorial.md` — learning-oriented content that builds something step-by-step
   - `reference/how-to.md` — task-oriented goal-driven steps
   - `reference/reference.md` — neutral, structured, scannable technical reference
   - `reference/explanation.md` — understanding-oriented context, rationale, and trade-offs
   - `reference/readme.md` — front-door README pages that route to deeper docs
4. **Write or update the file** at the target path.
5. **For delete actions:** confirm with the user one more time before deleting. Never delete silently.
6. **TaskUpdate to completed.**

Record each completed action in `generate.md`.

**`generate.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: docs-generate
run-id: <run-id>
files-created: [<paths>]
files-updated: [<paths>]
files-deleted: [<paths>]
actions-completed: <count>
actions-skipped: <count>
status: complete
created-at: <real timestamp>
---
```

# Step 5 — Review (orchestrator only)
Spot-check the generated documentation for quality and coherence. Load `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/review.md` for the Diátaxis-discipline rubric.

Launch one Explore sub-agent to review the generated files:

**For each file created or updated in this run:**
- Read the file and confirm it stays in its Diátaxis quadrant — no opinion in reference docs, no steps in explanations, no why in how-to guides
- Check that every code example in the generated doc actually exists in the codebase (re-verify accuracy)
- Check that cross-links between docs are valid (linked files exist, linked sections exist)
- Check that the reading level is appropriate for the intended audience (technical reference ≠ getting-started tutorial)

Write a `## Review Notes` section to `generate.md` with any issues found. For any accuracy issue found at review: fix it immediately before completing this step.

**Commit all documentation changes:**
`docs: update documentation via wf-docs run <run-id>`

# Step 6 — Primitive mode execution
Invoked only when Step 0 resolved to a primitive (first token matched a known key).

1. Load `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/<primitive>.md` in full.
2. Treat its content as your instructions. Follow it verbatim — no summarizing, paraphrasing, or skipping.
3. Pass the remaining `$ARGUMENTS` (everything after the primitive key) to it as the writing target.
4. The primitive is responsible for its own inputs-to-gather, structure, writing rules, and output contract. It writes one document at a path it decides (or the user supplies). It does not register a workflow artifact and does not run the orchestrator pipeline.
5. After the primitive completes, return a brief summary to the user: file path written, primitive used, anti-patterns avoided.

**Primitive reference table:**

| Key | Reference | Purpose |
|---|---|---|
| `plan` | `reference/plan.md` | Classify docs into Diátaxis quadrants, propose docs map and writing order |
| `tutorial` | `reference/tutorial.md` | Learning-oriented step-by-step lesson — beginner walkthrough, getting-started, first project |
| `how-to` | `reference/how-to.md` | Goal-oriented guide for competent users — task guide, troubleshooting, runbook, migration |
| `reference` | `reference/reference.md` | Neutral, structured, scannable technical reference — API, CLI, config, schema, error codes |
| `explanation` | `reference/explanation.md` | Understanding-oriented content — why, trade-offs, architecture, design rationale |
| `readme` | `reference/readme.md` | Front-door landing page that routes to deeper docs |
| `review` | `reference/review.md` | Audit existing docs against Diátaxis principles with prioritized fixes |

# Workflow rules (orchestrator mode)
- Store audit artifacts under `.ai/docs/<run-id>/`. Documentation output goes to project doc paths (not under `.ai/`).
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash.
- Always read source code before writing docs — do not write from memory or inference alone.
- Diátaxis quadrant discipline is non-negotiable. When in doubt, consult the [Diátaxis framework](https://diataxis.fr).
- For `mode: workflow`: check `02-shape.md → ## Documentation Plan` first — that plan was written by the author who knew the intent. Fulfill it before adding new docs.

# Chat return contract (orchestrator mode)
After completing, return ONLY:
- `run-id: <run-id>`
- `wrote: <audit artifact paths>`
- Summary: files created | updated | deleted | skipped
- ≤3 bullets on the most impactful gaps found or changes made
- `options:` — always include "Review generated docs" and "Run wf-docs again to verify" as options

# Chat return contract (primitive mode)
- File written: `<path>`
- Primitive used: `<key>`
- Diátaxis quadrant: `<tutorial|how-to|reference|explanation|readme|n/a>`
- ≤2 bullets on the document's main content or key decisions
