---
name: design-document
description: Create design documents and corresponding GitHub issues for new features. Use when user asks to "create design doc", "write design document", or document a feature design.
---

# Design Document Creation Skill

Create comprehensive design documents for new features and link them via GitHub issues.

## Workflow

### 1. Create the Design Document

Location: `packages/<pkg>/docs/<feature>.md`

Structure:
```markdown
# <Feature Name>

## Overview
Brief explanation of what this feature does and why it's needed.

## Design
Detailed specifications of how it works.

## Configuration
How users configure/use this feature.

## Examples
Code examples showing usage.

## Implementation Plan
Analyze codebase and list:
- Files to create
- Files to modify
- Integration points
- Testing approach
```

### 2. Commit and Push the Document

```bash
git add packages/<pkg>/docs/<feature>.md
git commit -m "Add design doc for <feature>"
git push
```

### 3. Create GitHub Issue

Format:
```markdown
**Feature**: <Brief description>

**Design Document**: <link to the .md file in the repo>

**Packages affected**: `pkg:<package-name>`

**Summary**:
<2-3 sentence overview>

**Implementation checklist**:
- [ ] Core implementation
- [ ] Tests
- [ ] Documentation
- [ ] Examples
```

Labels to add:
- `pkg:<package-name>`
- `enhancement`

### 4. Link Issue in Commit

If needed, reference the issue number in a follow-up commit or PR.

## Example

User: "Write a design doc for session tree persistence and create an issue"

1. Create `packages/coding-agent/docs/session-tree-persistence.md`
2. Write design covering:
   - How sessions are saved/loaded
   - File format (JSON)
   - API surface
   - Implementation files affected
3. Commit: `git commit -m "Add design doc for session tree persistence"`
4. Push: `git push`
5. Create issue:
   - Title: "Implement session tree persistence"
   - Body: Links to design doc, summarizes feature
   - Labels: `pkg:coding-agent`, `enhancement`
