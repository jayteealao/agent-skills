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

**Controlled-language check:**
- Grade the doc against [_ste-procedural.md](../_ste-procedural.md): section 1 (word discipline) throughout; sections 2–3 for step sequences and warnings; S4 for descriptive prose
- Report each violation with its rule ID (W1–W8, I1–I9, S1–S5). Prioritize the ones that can change what a reader does: two-referent pronouns in steps (W7), conditions after commands (I4), instructions hidden in notes (I8), terminology drift for one concept (W1)
- Batch register-level mechanics (contractions, Latin abbreviations, sentence-cap overruns) into one entry per file

Each sub-agent returns: file path, accuracy issues (list), quadrant violations (list), gaps (list), ste violations (list, with rule IDs), last-updated, freshness-risk (low/medium/high).
