# Docs orchestrator — the audit sub-agent prompt (Step 2)

Load this file from `docs.md` Step 2. Each audit sub-agent is prompted with the following for its assigned documentation file(s).

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

**Wording check:**
- Report each wording issue that can change what a reader does: a pronoun with two referents in a step, a condition after its command, an instruction hidden in a note, two terms for one concept
- Batch register-level mechanics (contractions, Latin abbreviations, overlong sentences) into one entry per file

Each sub-agent returns: file path, accuracy issues (list), quadrant violations (list), gaps (list), wording issues (list), last-updated, freshness-risk (low/medium/high).
