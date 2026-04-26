---
name: wf-design:critique
description: Evaluate design from a UX perspective with quantitative scoring (Nielsen's 10 heuristics), persona-based testing, cognitive load assessment, and actionable feedback. Use after implementation.
argument-hint: [slug]
disable-model-invocation: true
---

You are running `wf-design:critique`, a **post-implementation design quality gate** in the SDLC lifecycle. This evaluates the UX quality of an implemented feature with quantitative scoring and actionable feedback.

# Pipeline
1·intake → 2·shape → 2b·design → 3·slice → 4·plan → 5·implement → **6b·critique** → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `02b-design.md` (if exists), `05-implement-<slice-slug>.md` (at least one) |
| Produces | `06b-critique.md` |
| Next | `/design-*` skills to address findings, then `/wf-design:audit` or `/wf-review` |

# CRITICAL — execution discipline
You are a **design evaluator**, not a fixer.
- Do NOT fix issues you find — only report them. Fixes belong in `/design-*` skills or `/wf-implement`.
- Do NOT review code quality, run tests, or check technical correctness — those belong in `/wf-verify` and `/wf-design:audit`.
- Your job is to **evaluate UX quality and produce a scored critique report**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start fixing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - At least one `05-implement-*.md` file must exist. If missing → STOP. Tell the user: "Run `/wf-implement` first. Design critique evaluates implemented features."
   - If `06b-critique.md` already exists → WARN: "Design critique already exists. Running again will overwrite. Proceed?"
4. **Read the full context:**
   - `02-shape.md` — acceptance criteria and feature definition
   - `02b-design.md` — design brief (if exists; critique can run without it but note the gap)
   - `05-implement-<slice-slug>.md` — what was implemented (all slice implementation files)
   - `po-answers.md`
5. **Carry forward** `open-questions` from the index.

# Step 1 — Design Context Check (MANDATORY)
1. **Read `.impeccable.md`** from the project root.
2. If `.impeccable.md` does not exist or does not contain a `## Design Context` section → WARN: "No design context found. Critique will be less precise without brand personality, audience, and aesthetic direction. Consider running `/wf-design:setup` first." Proceed anyway — critique is still valuable without context.
3. If `.impeccable.md` exists, extract: Users, Brand Personality, Aesthetic Direction, Design Principles.
4. **Read design guidelines:** Read `../reference/design/design-guidelines.md`.

# Step 2 — Gather Assessments

Launch two independent assessments. **Neither must see the other's output** to avoid bias.

You SHOULD delegate each assessment to a separate sub-agent for independence. Sub-agents should return their findings as structured text. Do NOT output findings to the user yet.

If sub-agents are not available in the current environment, complete each assessment sequentially, writing findings to internal notes before proceeding.

## Assessment A: LLM Design Review

Read the relevant source files (HTML, CSS, JS/TS, component files) that were created or modified during implementation. If browser automation is available, visually inspect the live page.

Think like a design director. Evaluate:

**AI Slop Detection (CRITICAL):** Does this look like every other AI-generated interface? Check for: AI color palette (cyan-on-dark, purple-to-blue gradients, neon accents), gradient text, dark glows, glassmorphism, hero metric layouts, identical card grids, generic fonts (Inter, Roboto, Open Sans), side-stripe borders on cards, bounce/elastic easing, rounded rectangles with generic drop shadows. **The test**: If someone said "AI made this," would you believe them immediately?

**Holistic Design Review:** Evaluate:
- Visual hierarchy: eye flow, primary action clarity, information density
- Information architecture: structure, grouping, cognitive load
- Emotional resonance: does it match brand personality from `.impeccable.md`? Does it evoke the intended emotions?
- Discoverability: are interactive elements obvious? Is the primary action prominent?
- Composition: balance, whitespace, rhythm, intentional asymmetry
- Typography: hierarchy, readability, font choices, scale consistency
- Color: purposeful use, cohesion, accessibility, brand alignment
- States & edge cases: empty, loading, error, success — do they feel intentional?
- Microcopy: clarity, tone, helpfulness, alignment with brand voice

**Cognitive Load Assessment:**
- Run the 8-item cognitive load checklist. Report failure count: 0-1 = low (good), 2-3 = moderate, 4+ = critical.
- Count visible options at each decision point. If >4, flag it.
- Check for progressive disclosure: is complexity revealed only when needed?
- Check information density: can the user focus on one thing at a time?

**Emotional Journey:**
- What emotion does this interface evoke? Is that intentional and aligned with design context?
- **Peak-end rule**: Is the most intense moment positive? Does the experience end well?
- **Emotional valleys**: Check for anxiety spikes at high-stakes moments (payment, delete, commit, irreversible actions). Are there design interventions (progress indicators, reassurance copy, undo options)?

**Nielsen's 10 Heuristics** — score each 0-4:
1. Visibility of System Status
2. Match Between System and the Real World
3. User Control and Freedom
4. Consistency and Standards
5. Error Prevention
6. Recognition Rather Than Recall
7. Flexibility and Efficiency of Use
8. Aesthetic and Minimalist Design
9. Help Users Recognize, Diagnose, and Recover from Errors
10. Help and Documentation

Return structured findings covering: AI slop verdict, heuristic scores (each scored 0-4), cognitive load assessment, emotional journey analysis, what's working (2-3 items), priority issues (3-5 with what/why/fix), minor observations, and provocative questions.

## Assessment B: Automated Detection

Run the bundled deterministic detector if available, which flags 25 specific patterns (AI slop tells + general design quality).

**CLI scan:**
```bash
npx impeccable --json [--fast] [target]
```

- Pass HTML/JSX/TSX/Vue/Svelte files or directories as `[target]` (anything with markup). Do not pass CSS-only files.
- For large directories (200+ scannable files), use `--fast` (regex-only, skips jsdom).
- For 500+ files, narrow scope to the files touched by implementation.
- Exit code 0 = clean, 2 = findings.

**Browser visualization** (when browser automation tools are available AND the target is a viewable page):

1. **Start the live detection server:**
   ```bash
   npx impeccable live &
   ```
   Note the port printed to stdout.
2. **Create a new tab** and navigate to the page. Do not reuse existing tabs.
3. **Label the tab** via JavaScript: `document.title = '[Human] ' + document.title;`
4. **Scroll to top** to ensure the page is at the very top before injection.
5. **Inject** via JavaScript (replace PORT): `const s = document.createElement('script'); s.src = 'http://localhost:PORT/detect.js'; document.head.appendChild(s);`
6. Wait 2-3 seconds for the detector to render overlays.
7. **Read results from console** using `read_console_messages` with pattern `impeccable`. The detector logs all findings with the `[impeccable]` prefix.
8. **Cleanup:** Stop the live server: `npx impeccable live stop`

If the `impeccable` CLI is not available, skip Assessment B and note: "Automated detection unavailable. Critique based on LLM review only."

Return: CLI findings (JSON), browser console findings (if applicable), and any false positives noted.

# Step 3 — Generate Combined Critique Report

Synthesize both assessments into a single report. Do NOT simply concatenate. Weave the findings together, noting where the LLM review and detector agree, where the detector caught issues the LLM missed, and where detector findings are false positives.

Structure your feedback as a design director would:

### Design Health Score

Present the Nielsen's 10 heuristics scores as a table:

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | ? | [specific finding or "n/a" if solid] |
| 2 | Match System / Real World | ? | |
| 3 | User Control and Freedom | ? | |
| 4 | Consistency and Standards | ? | |
| 5 | Error Prevention | ? | |
| 6 | Recognition Rather Than Recall | ? | |
| 7 | Flexibility and Efficiency | ? | |
| 8 | Aesthetic and Minimalist Design | ? | |
| 9 | Error Recovery | ? | |
| 10 | Help and Documentation | ? | |
| **Total** | | **??/40** | **[Rating band]** |

Be honest with scores. A 4 means genuinely excellent. Most real interfaces score 20-32.

**Rating bands**: 35-40 Exceptional, 28-34 Strong, 20-27 Adequate, 12-19 Weak, 0-11 Critical.

### Anti-Patterns Verdict

**Start here.** Does this look AI-generated?

**LLM assessment**: Your own evaluation of AI slop tells. Cover overall aesthetic feel, layout sameness, generic composition, missed opportunities for personality.

**Deterministic scan**: Summarize what the automated detector found, with counts and file locations. Note any additional issues the detector caught that you missed, and flag any false positives.

**Visual overlays** (if browser was used): Tell the user that overlays are now visible in the **[Human]** tab in their browser, highlighting the detected issues. Summarize what the console output reported.

### Overall Impression
A brief gut reaction: what works, what doesn't, and the single biggest opportunity.

### What's Working
Highlight 2-3 things done well. Be specific about why they work.

### Priority Issues
The 3-5 most impactful design problems, ordered by importance.

For each issue, tag with **P0-P3 severity**:
- **P0 Blocking**: Prevents task completion — fix immediately
- **P1 Major**: Significant difficulty or WCAG AA violation — fix before release
- **P2 Minor**: Annoyance, workaround exists — fix in next pass
- **P3 Polish**: Nice-to-fix, no real user impact — fix if time permits

For each issue:
- **[P?] What**: Name the problem clearly
- **Why it matters**: How this hurts users or undermines goals
- **Fix**: What to do about it (be concrete)
- **Suggested skill**: Which `/design-*` skill could address this (from: `/design-polish`, `/design-typeset`, `/design-colorize`, `/design-quieter`, `/design-overdrive`, `/design-clarify`, `/design-bolder`, `/design-distill`, `/design-harden`, `/design-layout`, `/design-animate`, `/design-optimize`, `/design-adapt`, `/design-delight`)

### Persona Red Flags

Auto-select 2-3 personas most relevant to this interface type. If `.impeccable.md` contains design context, also generate 1-2 project-specific personas from the audience/brand info.

For each selected persona, walk through the primary user action and list specific red flags found:

**Example format:**
- **Alex (Power User)**: No keyboard shortcuts detected. Form requires 8 clicks for primary action. Forced modal onboarding. High abandonment risk.
- **Jordan (First-Timer)**: Icon-only nav in sidebar. Technical jargon in error messages ("404 Not Found"). No visible help. Will abandon at step 2.

Be specific. Name the exact elements and interactions that fail each persona. Don't write generic persona descriptions; write what broke for them.

### Cognitive Load Assessment
- Checklist failure count and rating (low/moderate/critical)
- Decision point analysis (visible options per decision)
- Progressive disclosure evaluation

### Minor Observations
Quick notes on smaller issues worth addressing.

### Questions to Consider
Provocative questions that might unlock better solutions:
- "What if the primary action were more prominent?"
- "Does this need to feel this complex?"
- "What would a confident version of this look like?"

# Step 4 — Ask the User

**After presenting findings**, use targeted questions based on what was actually found. STOP and call the AskUserQuestion tool to clarify. These answers will shape the action plan.

Ask questions along these lines (adapt to the specific findings; do NOT ask generic questions):

1. **Priority direction**: Based on the issues found, ask which category matters most right now. Example: "I found problems with visual hierarchy, color usage, and information overload. Which area should we tackle first?" Offer the top 2-3 issue categories as options.

2. **Design intent**: If the critique found a tonal mismatch, ask whether it was intentional. Example: "The interface feels clinical and corporate. Is that the intended tone, or should it feel warmer/bolder/more playful?" Offer 2-3 tonal directions as options based on what would fix the issues.

3. **Scope**: Ask how much the user wants to take on. Example: "I found N issues. Want to address everything, or focus on the top 3?" Offer scope options like "Top 3 only", "All issues", "Critical issues only (P0-P1)".

4. **Constraints** (optional; only ask if relevant): If findings touch many areas, ask if anything is off-limits. Example: "Should any sections stay as-is?"

**Rules for questions:**
- Every question must reference specific findings from the report. Never ask generic "who is your audience?" questions.
- Keep it to 2-4 questions maximum. Respect the user's time.
- Offer concrete options, not open-ended prompts.
- If findings are straightforward (e.g., only 1-2 clear issues), skip questions and go directly to Step 5.

Append every answer to `po-answers.md` with timestamp and stage (`critique`).

# Step 5 — Recommended Actions

**After receiving the user's answers**, present a prioritized action summary reflecting the user's priorities and scope.

### Action Summary

List recommended `/design-*` skills in priority order, based on the user's answers:

1. **`/design-<skill-name>`**: Brief description of what to fix (specific context from critique findings)
2. **`/design-<skill-name>`**: Brief description (specific context)
...

**Rules for recommendations:**
- Only recommend `/design-*` skills: `/design-polish`, `/design-typeset`, `/design-colorize`, `/design-quieter`, `/design-overdrive`, `/design-clarify`, `/design-bolder`, `/design-distill`, `/design-harden`, `/design-layout`, `/design-animate`, `/design-optimize`, `/design-adapt`, `/design-delight`
- Order by the user's stated priorities first, then by impact
- Each item's description should carry enough context that the skill knows what to focus on
- Map each Priority Issue to the appropriate `/design-*` skill
- Skip skills that would address zero issues
- If the user chose a limited scope, only include items within that scope
- If the user marked areas as off-limits, exclude skills that would touch those areas
- End with `/design-polish` as the final step if any fixes were recommended

After presenting the summary, tell the user:

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `/wf-design:critique` after fixes to see your score improve.
>
> When design quality is satisfactory, continue with `/wf-design:audit` for technical quality checks, or `/wf-review <slug>` for code review.

# Step 6 — Write Artifact

Write `06b-critique.md` to `.ai/workflows/<slug>/06b-critique.md`.

**Timestamps must be real:** Run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time.

```yaml
---
schema: sdlc/v1
type: design-critique
slug: <slug>
status: complete
stage-number: 6.5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
design-health-score: <N>/40
anti-patterns-found: <N>
priority-issues-count: <N>
cognitive-load-rating: <low|moderate|critical>
design-context: .impeccable.md
metric-p0-count: <N>
metric-p1-count: <N>
metric-p2-count: <N>
metric-p3-count: <N>
tags: []
refs:
  index: 00-index.md
  shape: 02-shape.md
  design: 02b-design.md
  implement-index: 05-implement.md
next-command: wf-design:audit
next-invocation: "/wf-design:audit <slug>"
---
```

Include the full critique report body (all sections from Step 3) plus the recommended actions from Step 5.

# Step 7 — Update 00-index.md

Update `00-index.md`:
- Add `06b-critique.md` to `workflow-files`.
- Update `updated-at` with the real timestamp.
- Update `recommended-next-command` and `recommended-next-invocation` based on the critique results.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `score: <N>/40` (Design Health Score)
- `issues: <P0>/<P1>/<P2>/<P3>` (count by severity)
- `options:` recommended `/design-*` skills to run
- <=3 short blocker bullets if needed
