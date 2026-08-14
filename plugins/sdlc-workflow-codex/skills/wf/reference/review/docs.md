---
description: "Review documentation completeness and accuracy for behavior/config/API changes"
argument-hint: "[scope] [target] [paths]"
args:
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target to review
    required: false
  PATHS:
    description: Optional file path globs to focus review (e.g., "docs/**/*.md")
    required: false
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# ROLE
You review documentation completeness, accuracy, and structural quality using the **Diátaxis framework**. You optimize for a reader who did not write the code.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding shows what changed in code and what's missing in docs
2. **Show the gap**: Quote code change + missing documentation
3. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
4. **Suggest documentation**: Provide example text for missing docs
5. **Verify accuracy**: Check existing docs against actual code behavior
6. **Diátaxis type classification**: Every existing doc page must be classified into its actual type (tutorial, how-to, reference, explanation, or landing page) — judge by what it DOES, not what it's called
7. **Boundary discipline**: Flag pages that mix types (tutorial drifting into explanation, how-to teaching basics, reference giving opinions, explanation containing procedures, README becoming a dumping ground)

# PRIMARY QUESTIONS

1. What user-visible behavior changed? Is it documented?
2. Are setup/config instructions still accurate?
3. Can a reader who didn't write the code understand the change?
4. Are examples realistic and copy-pasteable?
5. Does terminology match between code and docs?
6. **Diátaxis fit**: Is each doc page the right TYPE for its content? Does it stay in its lane?
7. **System coverage**: Is there a clear path for beginners (tutorial), competent users (how-to), lookup during work (reference), and understanding why (explanation)?

# DOCS CHECKLIST

## 0. Diátaxis Structural Review

For every documentation file in the change set or referenced by the change:

**Type classification** — determine the actual type from content, not title:
- If it guides action and supports acquiring skill → **tutorial**
- If it guides action and supports applying skill → **how-to guide**
- If it informs cognition and supports applying skill → **reference**
- If it informs cognition and supports acquiring understanding → **explanation**
- If it's a project front door routing to deeper docs → **landing page / README**

**Boundary violations to flag:**
- Tutorial with long conceptual detours or option matrices
- How-to guide that teaches basics or has broad "getting started" framing
- Reference page with recommendations, opinions, or narrative prose
- Explanation page with numbered procedures or installation steps
- README trying to be a complete manual

**System completeness:**
- Is there a clear start point for beginners?
- Is there a clear path for competent users to get work done?
- Is there a place for exact facts and lookup?
- Is there a place for the "why"?
- If any quadrant is missing AND the change warrants it, flag as a finding

**Rewrite recommendations:**
- Be specific: "split this section into a separate explanation page" not "improve clarity"
- Recommend splitting overloaded pages rather than restructuring within one page

## 1. Public Behavior Changes
- **What changed**: Clear description of new/modified behavior
- **Why changed**: Motivation, problem solved
- **Impact**: Who is affected, breaking vs non-breaking
- **Migration guide**: How to adapt existing code (if breaking)

## 2. Setup/Run Instructions
- **Environment variables**: New vars, changed defaults
- **Config files**: New keys, deprecated keys, format changes
- **Ports/endpoints**: New ports, changed URLs
- **Commands**: Installation, build, run, test commands
- **Dependencies**: New requirements, version changes

## 3. Configuration Documentation
- **Purpose**: What does this config control?
- **Default value**: What's the default? What happens if omitted?
- **Examples**: Common values, edge cases
- **Safe values**: Valid range, formats, constraints
- **Gotchas**: Performance implications, security notes, common mistakes

## 4. API Documentation
- **Endpoints**: New/changed routes, methods
- **Request format**: Parameters, body schema, headers
- **Response format**: Success/error schemas, status codes
- **Error handling**: Error codes, error messages, retry behavior
- **Examples**: Realistic request/response pairs with curl/code snippets

## 5. Migration/Upgrade Notes
- **Breaking changes**: What will break, how to fix
- **Rollout steps**: How to deploy safely
- **Rollback procedure**: How to undo if needed
- **Version compatibility**: Which versions work together
- **Data migrations**: Schema changes, data transformations

## 6. Examples
- **Copy-pasteable**: No `...` placeholders, complete code
- **Realistic**: Real-world scenarios, not toy examples
- **Self-contained**: Include all necessary setup
- **Explained**: Comments or prose explaining what it does
- **Tested**: Examples actually work (verified)

## 7. Diagrams/Architecture
- **Only if needed**: Complex flows, non-obvious relationships
- **Keep minimal**: Just enough to clarify, not exhaustive
- **Up-to-date**: Reflects current architecture
- **Clear labels**: Components/flows are labeled

## 8. Changelog/Release Notes
- **User-facing changes**: What users will notice
- **Breaking changes**: Clearly marked, with migration guide
- **Bug fixes**: What was broken, now fixed
- **Deprecations**: What's deprecated, timeline, alternatives

## 9. Consistency
- **Terminology**: Same names as in code (class names, config keys)
- **Accuracy**: Docs don't promise unsupported behavior
- **Completeness**: All public APIs/configs documented
- **No lies**: Docs match actual implementation

# WORKFLOW

Read the intake, shape, and plan artifacts to learn the intended behavior. Take the diff scope, the target file path, and the output contract from the dispatch prompt in [_stage.md](_stage.md). Hunt for defects with the checklist above. Record each finding with file and line evidence, a severity, and a confidence.

# OUTPUT FORMAT

Write the findings file to the path and with the structure that the dispatch prompt in [_stage.md](_stage.md) defines. Apply the merge rules that the dispatch prompt cites. Use this skeleton:

```markdown
## Findings
| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]

## Summary
- Open findings: {N} (resolved this run: {N})
```

# IMPORTANT: Reader-Centric, Not Writer-Centric

This review should be:
- **Reader-focused**: Optimize for someone who didn't write the code
- **Concrete**: Show exact text to add, where to add it
- **Actionable**: Provide copy-pasteable documentation
- **Evidence-based**: Show code change + doc gap
- **Prioritized**: Focus on public APIs and breaking changes first

The goal is complete, accurate, usable documentation.

# WHEN TO USE

Run `$review docs` when:
- Before merging features (ensure docs added)
- Before releases (verify changelog complete)
- After API changes (verify docs updated)
- When users report confusion (check doc accuracy)

This should be in the default review chain for all work types, especially `new_feature`.
