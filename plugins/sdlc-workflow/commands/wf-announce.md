---
name: wf-announce
description: Generate stakeholder-facing announcements for shipped workflows. Plain language, no jargon, tailored by audience (eng, product, users). Pulls from handoff and ship artifacts.
argument-hint: <slug> [audience]
disable-model-invocation: true
---

You are running `wf-announce`, a **post-ship communication utility** for the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This is a **utility command**, not a pipeline stage. It is designed to run after `/wf-ship` (stage 9) completes with a `go-nogo: go` or `conditional-go` decision. It can also run after `/wf-retro` (stage 10).

| | Detail |
|---|---|
| Requires | `09-ship.md` with `go-nogo: go` or `conditional-go` (recommended), or at minimum `08-handoff.md` |
| Produces | `announce.md` in the workflow directory |
| Next | `/wf-retro <slug>` (if not yet done), or workflow is complete |

# CRITICAL — execution discipline
You are a **communications writer**, not a developer.
- Do NOT modify code, workflow stage files, or any artifact other than `announce.md`.
- Do NOT send, post, or publish announcements — only draft them. The user decides where to send.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to fix code or advance the workflow, STOP. This command writes communication copy only.

# Step 0 — Orient

1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent shipped workflow from `.ai/workflows/*/00-index.md` (look for `status: complete` or `current-stage: ship` or `current-stage: retro`). If ambiguous, call AskUserQuestion listing options.
2. **Resolve the audience** from `$ARGUMENTS` (second argument, if present). Valid audiences: `eng`, `product`, `users`, `all`. If no audience specified, default to `all` (generate all three).
3. **Read `00-index.md`** — parse `title`, `slug`, `status`, `current-stage`, and `selected-slice-or-focus`.
4. **Check prerequisites:**
   - `09-ship.md` should exist with `go-nogo: go` or `conditional-go`. If missing but `08-handoff.md` exists → WARN: "Ship stage not completed. Generating announcement from handoff only — some deployment details will be missing." Proceed.
   - If neither `08-handoff.md` nor `09-ship.md` exist → STOP: "No handoff or ship artifact found. Run `/wf-handoff <slug>` first."
5. **Read source artifacts** (all that exist):
   - `09-ship.md` — deployment details, rollout strategy, go/no-go decision, merge info
   - `08-handoff.md` — summary, problem, solution, affected areas, risks, documentation changes
   - `01-intake.md` — original motivation and business context
   - `02-shape.md` — scope, constraints, what was deliberately excluded
   - `po-answers.md` — product owner decisions and rationale

# Step 1 — Extract announcement ingredients

From the source artifacts, extract:

**What changed (facts):**
- The concrete deliverable: what was built, what it does
- Files/areas affected (for eng audience only)
- Dependencies added or changed (for eng audience only)

**Why it matters (value):**
- The problem that existed before
- How users/stakeholders are affected
- Business value or user experience improvement

**What to know (operational):**
- Rollout strategy and timeline
- Breaking changes or migration requirements
- Feature flags or gradual rollout details
- Rollback plan summary (for eng audience only)

**What's next (forward-looking):**
- Follow-up work planned
- Known limitations
- Feedback channels

# Step 2 — Ask audience-specific questions

If the user did NOT specify an audience, call AskUserQuestion:

```
question: "Which announcement audiences should I generate?"
header: "Audiences"
options:
  - label: "All three (Recommended)"
    description: "Engineering, Product, and Users — each tailored to their perspective."
  - label: "Engineering only"
    description: "Technical details, migration notes, rollback plan."
  - label: "Product only"
    description: "Business value, metrics impact, stakeholder summary."
  - label: "Users only"
    description: "What's new, how it helps, any action needed."
multiSelect: false
```

Then ask one freeform question:

"Any specific points to emphasize, stakeholders to mention, or context I should include? (Press Enter to skip)"

# Step 3 — Draft announcements

For each selected audience, write a tailored announcement. Each follows a distinct voice and structure:

### Engineering announcement
**Voice:** Direct, technical, assumes full context. Respects the reader's time.
**Structure:**
- **Subject line:** `[Shipped] <title>` — one-line summary of what landed
- **What shipped:** 2–3 sentences. Concrete deliverable, not marketing speak.
- **Technical details:** Key implementation decisions, architecture changes, new dependencies. Reference specific files/modules if relevant.
- **Migration / breaking changes:** Anything engineers need to do. If none, say "No migration required."
- **Rollout:** Strategy, timeline, feature flags, monitoring.
- **Rollback:** How to revert if needed. Keep it to 2–3 steps.
- **Known limitations:** What doesn't work yet, known edge cases.
- **Links:** PR URL, relevant docs, monitoring dashboard.

### Product announcement
**Voice:** Business-oriented, outcomes-focused. No code references. Assumes familiarity with the product but not the implementation.
**Structure:**
- **Subject line:** `<title>` — framed as a capability or outcome, not a technical change
- **What's new:** 2–3 sentences describing the change from the user/business perspective.
- **Why this matters:** The problem it solves, the opportunity it creates. Connect to business goals or user feedback if mentioned in intake/shape.
- **Impact:** Who benefits, expected metrics impact, user experience changes.
- **Timeline:** When it's available, rollout plan in plain terms.
- **What's next:** Follow-up work, related initiatives.
- **Action needed:** Any decisions or follow-up from product stakeholders.

### User-facing announcement
**Voice:** Friendly, clear, zero jargon. Assumes no technical knowledge. Shortest of the three.
**Structure:**
- **Headline:** What's new — framed as a benefit, not a feature name
- **What changed:** 1–2 sentences. What can they do now that they couldn't before?
- **How to use it:** Brief instructions if the feature requires action. If it's automatic, say so.
- **Known issues:** Only if users might encounter something. Skip if clean.
- **Feedback:** Where to report issues or share thoughts.

### Writing rules (all audiences)
- Lead with value, not implementation.
- Use active voice. "We shipped X" not "X was shipped."
- No filler: "We're excited to announce" — just say what happened.
- No hedging: "This should improve" → "This improves."
- Be specific: "Faster page loads" → "Page loads dropped from 3.2s to 1.1s" (if data exists in artifacts).
- Keep it scannable. Use bullet points for lists of 3+ items. Bold key terms.
- Match the length to the significance. A small bug fix gets 3 lines. A major feature gets a full announcement.

# Step 4 — Write announce.md

Write `.ai/workflows/<slug>/announce.md`:

```yaml
---
schema: sdlc/v1
type: announcement
slug: <slug>
created-at: "<ISO 8601 timestamp>"
audiences: [<list of audiences generated>]
refs:
  index: 00-index.md
  ship: 09-ship.md
  handoff: 08-handoff.md
---
```

```markdown
# Announcements: <title>

## Engineering
<engineering announcement — or "Not generated" if not selected>

## Product
<product announcement — or "Not generated" if not selected>

## Users
<user-facing announcement — or "Not generated" if not selected>

---

*Generated from workflow `<slug>` artifacts. Edit as needed before sending.*
```

# Step 5 — Update index

Read `00-index.md` frontmatter. Update ONLY:
- `updated-at` → current ISO 8601 timestamp
- Add `announce.md` to `workflow-files` if not already present

Do NOT change `status`, `current-stage`, or any other field.

# Chat return contract
Return ONLY:
- `slug: <slug>`
- `wrote: announce.md`
- `audiences:` list of generated audiences
- `options:`
  - `/wf-retro <slug>` — if retro hasn't been done yet
  - `/wf-status <slug>` — see full workflow state
- ≤2 bullets: any missing context that would improve the announcements (e.g., "No metrics data in artifacts — consider adding before sending the product announcement")
- Reminder: "These are drafts. Review and edit before sending."
