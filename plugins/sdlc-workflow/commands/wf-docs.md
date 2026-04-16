---
name: wf-docs
description: Documentation audit and generation workflow. Discovers existing docs, audits them against the codebase and Diátaxis principles, plans what to create/update/remove, and generates using Diátaxis skills.
argument-hint: [slug|--audit-only|path]
disable-model-invocation: true
---

You are running `wf-docs`, a **documentation maintenance workflow**.

# Pipeline
`1·discover` → `2·audit` → `3·plan` → `4·generate` → `5·review`

| | Detail |
|---|---|
| Requires | Nothing — can run on any project at any time |
| Produces | `.ai/docs/<run-id>/` audit artifacts + in-place documentation updates |
| No argument | Audit and update all project documentation |
| `<slug>` | Generate and update docs for a specific workflow's changes |
| `--audit-only` | Produce the gap analysis plan but do not write any docs |
| `<path>` | Scope to a specific directory or file (`docs/`, `src/api/`, etc.) |

# CRITICAL — execution discipline
You are a **documentation orchestrator**. You are not a writer operating in isolation.
- Do NOT generate docs without first auditing what already exists — creating duplicate content is worse than a gap.
- Do NOT write docs in the wrong Diátaxis quadrant. A reference page must not contain opinion. A tutorial must build something. A how-to must be goal-oriented. An explanation must not contain steps.
- Do NOT modify source code while generating docs. Documentation lives in markdown files.
- Do NOT delete or overwrite existing documentation without explicitly noting the deletion in the plan and confirming with the user.
- For `slug` mode: read the actual workflow artifacts (`02-shape.md`, `03-slice.md`, `08-handoff.md`) to understand what was built before writing anything.
- Follow the numbered steps exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Parse arguments** from `$ARGUMENTS`:
   - No argument → `mode: project`, scope is entire project
   - Argument matches an existing `.ai/workflows/<slug>/00-index.md` → `mode: workflow`, `target-slug: <slug>`
   - Argument is `--audit-only` → `mode: project`, `audit-only: true`
   - Argument is a path → `mode: path`, `scope-path: <path>`
2. **Generate run ID:** `docs-<YYYYMMDD-HHMM>` (run `date +"%Y%m%d-%H%M"` via Bash).
3. **For `mode: workflow`:** Read the workflow's index and all stage artifacts to understand what changed. Pay special attention to `02-shape.md` → `## Documentation Plan` (the Diátaxis doc plan written at shape).

# Step 1 — Discover
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

# Step 2 — Audit
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

# Step 3 — Plan
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
- Diátaxis skill to invoke: `tutorial-writer` | `how-to-guide-writer` | `reference-writer` | `explanation-writer` | `readme-writer`
- Scope: what specifically to write or change (2–4 sentences)
- Required reading: which source files or workflow artifacts the writer must read first

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

# Step 4 — Generate
Execute the plan in priority order.

For each action, sequentially:

1. **TaskCreate** the action: `"<action-type> <file-path>"`
2. **Read required source files** before writing anything — do not write from memory
3. **Invoke the appropriate Diátaxis skill** by including its guidelines in the generation prompt. The relevant skills are:
   - `tutorial-writer` — for learning-oriented content that builds something step-by-step
   - `how-to-guide-writer` — for task-oriented goal-driven steps
   - `reference-writer` — for neutral, structured, scannable technical reference
   - `explanation-writer` — for understanding-oriented context, rationale, and trade-offs
   - `readme-writer` — for front-door README pages that route to deeper docs
4. **Write or update the file** at the target path
5. **For delete actions:** confirm with the user one more time before deleting. Never delete silently.
6. TaskUpdate to completed

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

# Step 5 — Review
Spot-check the generated documentation for quality and coherence.

Launch one Explore sub-agent to review the generated files:

**For each file created or updated in this run:**
- Read the file and confirm it stays in its Diátaxis quadrant — no opinion in reference docs, no steps in explanations, no why in how-to guides
- Check that every code example in the generated doc actually exists in the codebase (re-verify accuracy)
- Check that cross-links between docs are valid (linked files exist, linked sections exist)
- Check that the reading level is appropriate for the intended audience (technical reference ≠ getting-started tutorial)

Write a `## Review Notes` section to `generate.md` with any issues found. For any accuracy issue found at review: fix it immediately before completing this step.

**Commit all documentation changes:**
`docs: update documentation via wf-docs run <run-id>`

# Workflow rules
- Store audit artifacts under `.ai/docs/<run-id>/`. Documentation output goes to project doc paths (not under `.ai/`).
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash.
- Always read source code before writing docs — do not write from memory or inference alone.
- Diátaxis quadrant discipline is non-negotiable. When in doubt, consult the [Diátaxis framework](https://diataxis.fr).
- For `mode: workflow`: check `02-shape.md → ## Documentation Plan` first — that plan was written by the author who knew the intent. Fulfill it before adding new docs.

# Chat return contract
After completing, return ONLY:
- `run-id: <run-id>`
- `wrote: <audit artifact paths>`
- Summary: files created | updated | deleted | skipped
- ≤3 bullets on the most impactful gaps found or changes made
- `options:` — always include "Review generated docs" and "Run wf-docs again to verify" as options
