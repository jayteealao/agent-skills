---
description: Generate a dense, token-efficient context brief for a workflow. Reads all stage files and po-answers, distills into ~500 words. Designed for resuming after a break, onboarding a sub-agent, or recovering context in a new session.
argument-hint: [slug]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-resume`, the **context recovery** command for the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This command reads the full workflow trail and produces a dense brief. It writes `90-resume.md` as a reference artifact, then returns the brief in chat.

# CRITICAL — execution discipline
You are a **context synthesizer**, not a problem solver.
- Do NOT advance the workflow, fix issues, or start any stage.
- Do NOT modify any workflow files except `90-resume.md`.
- Your job is to **read everything and distill it into the shortest possible brief that fully recovers context**.
- Every sentence must earn its place. Target ~500 words. Do NOT pad, do NOT explain obvious things, do NOT repeat the stage file contents verbatim.
- If you catch yourself about to start working on the project, STOP. Output the brief and nothing else.

# Step 0 — Discover and read

1. **Resolve the slug** from `$ARGUMENTS`. If no slug given, scan `.ai/workflows/*/00-index.md` for active workflows. If exactly one → use it. If multiple → list them with current stage and ask the user which one. If none → "No workflows found. Start one with `/wf-quick quick intake <description>`." STOP.

2. **Read `00-index.md`** — parse full frontmatter: `title`, `slug`, `status`, `current-stage`, `stage-number`, `updated-at`, `selected-slice-or-focus`, `open-questions`, `recommended-next-invocation`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `progress`, `workflow-files`.

3. **Read every existing stage file** listed in `workflow-files` (or glob `.ai/workflows/<slug>/*.md`). For each, parse YAML frontmatter and scan the body for:
   - Key decisions, constraints, and trade-offs
   - Acceptance criteria (from shape/slice)
   - Deviations from plan (from implement)
   - Test results and unmet criteria (from verify)
   - Review findings still open (from review)
   - Open questions and blockers at any stage

4. **Read `po-answers.md`** — extract all product-owner decisions. Discard questions that were superseded by later decisions. Keep only decisions that constrain future work.

5. **Check branch state** (if `branch-strategy` is `dedicated`):
   - Run `git branch --show-current`
   - Note if the user is on the wrong branch

6. **Check slice progress** (if slices exist):
   - Glob for all `03-slice-*.md`, `04-plan-*.md`, `05-implement-*.md`, `06-verify-*.md` files
   - Build the slice progress matrix

# Step 1 — Synthesize the brief

Write the brief following this exact structure. Be ruthlessly concise — every line is one fact or decision, no filler.

```markdown
# Resume: <title>
Slug: <slug> | Stage: <N>·<stage-name> | Status: <status> | Updated: <YYYY-MM-DD>
Branch: <branch> (base: <base-branch>) | PR: <pr-url or "none">

## Goal
<1-2 sentences: what problem this solves and for whom, from intake/shape>

## Key Decisions
<Bulleted list of product-owner and architectural decisions that constrain remaining work. One line each. Only include decisions that someone resuming this work MUST know. Omit obvious or superseded decisions.>

## Current State
<What stages are complete, what is in-progress, what is pending. If implementing: which plan step we're on. If verifying: which checks passed/failed. Be specific.>

## Slice Progress
<Table only if sliced. Use ✓/→/✗/· symbols.>

| Slice | Plan | Impl | Verify | Review | Handoff | Ship |
|-------|------|------|--------|--------|---------|------|

## Acceptance Criteria Status
<List each AC from the current slice with met/not-met/untested status. Skip if all are untested (not yet at verify).>

## Open Questions & Blockers
<Unresolved questions from any stage. Active blockers. If none: "None">

## Constraints & Watchouts
<Non-obvious constraints from shape, plan, or review that someone resuming MUST respect. Things like: "migration must be reversible", "cannot touch the auth module until slice X lands", "external API has a rate limit of 100/min".>

## Review Findings Still Open
<Only if review has happened and findings remain unfixed. Skip section entirely if no review yet.>

## Next
`<recommended-next-invocation>` — <one-line reason>
<If on wrong branch: "⚠ You are on `<current>` — switch to `<branch>` first">
<Alternative options from the current stage's recommended next stage, if any>
```

# Step 2 — Write and return

1. **Get current timestamp**: Run `date -u +"%Y-%m-%dT%H:%M:%SZ"`.
2. **Write `90-resume.md`** with this frontmatter:

```yaml
---
schema: sdlc/v1
type: resume
slug: <slug>
generated-at: "<iso-8601>"
current-stage: <stage-name>
stage-number: <N>
status: <status>
selected-slice: "<slice-slug or empty>"
word-count: <N>
refs:
  index: 00-index.md
---
```

Followed by the brief body.

3. **Return the brief in chat.** The chat output IS the brief — no preamble, no "here's your brief", no explanation. Just the brief itself, so the user (or a sub-agent reading the transcript) gets maximum signal with minimum noise.

# Token budget discipline

The brief MUST be under 600 words. If you find yourself going over:
- Merge related decisions into single lines
- Drop decisions that are obvious from the code
- Drop acceptance criteria that are clearly met (only list unmet or untested)
- Compress slice progress into a single line if all slices are at the same stage
- Drop the review findings section if there are none

If the workflow is very early (only intake/shape done), the brief should be ~200 words. Do not pad to fill 500 words.

If the workflow is complex (multi-slice, deep into implementation with review findings), the brief may reach 600 words. Do not compress to the point of losing critical context.

# Chat return contract
Return ONLY the brief. No `slug:`, no `wrote:`, no `options:` footer. The brief IS the entire output. The `## Next` section within the brief serves as the routing information.
