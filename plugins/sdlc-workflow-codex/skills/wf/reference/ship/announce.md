---
description: The post-publish announce phase of `$wf ship`. Drafts stakeholder-facing announcements for a shipped workflow — plain language, no jargon, tailored by audience (eng, product, users) — pulling from handoff and ship-run artifacts. Runs automatically at the tail of a go / conditional-go ship run, or on demand via `$wf ship <slug> announce` to regenerate comms without re-shipping.
argument-hint: <slug> [audience]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running the **announce phase** of `$wf ship` — post-publish communications. It runs at the
tail of a `go` / `conditional-go` ship run (drafting announcements from the just-written run artifact),
or on its own via `$wf ship <slug> announce` to regenerate comms without re-shipping. It writes only
`announce.md` and stamps `announcements-sent` on the ship-run; it never ships, advances the workflow,
or edits code.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → `9·ship` → 10·retro

| | Detail |
|---|---|
| Requires | Latest `09-ship-run-<run-id>.md` with `go-nogo: go` or `conditional-go` (recommended), or at minimum `08-handoff.md`. Also reads `.ai/ship-plan.md` for Block G channel config when present. |
| Produces | `announce.md` in the workflow directory; updates `announcements-sent` in the latest ship-run artifact |
| Next | `$wf retro <slug>` (if not yet done), or workflow is complete |

> **Optional second opinion.** Before finalizing the announcement, you may offer
> `$consult <critique this release announcement for clarity, accuracy, and tone>`
> (or `$consult <provider> …`) — a read-only multi-model panel that reads the draft
> as an outside audience would. (The announcement is product-facing copy, so it
> carries no workflow internals.) The model may run this itself when it clearly adds value (pin `codex`/`claude` to stay free); otherwise just offer it.

# CRITICAL — execution discipline
You are a **communications writer**, not a developer.
- Do NOT modify code, workflow stage files, or any artifact other than `announce.md` (and the
  `announcements-sent` touch on the ship-run).
- Do NOT send, post, or publish announcements — only draft them. The user decides where to send.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to fix code or advance the workflow, STOP. This phase writes communication copy only.

# Step 0 — Orient

1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent shipped workflow from `.ai/workflows/*/00-index.md` (look for `status: complete` or `current-stage: ship` or `current-stage: retro`). If ambiguous, ask the user directly in chat, presenting options as a short numbered list. *(When invoked as the tail phase of a ship run, the slug and latest run are already in hand — use them.)*
2. **Resolve the audience** from `$ARGUMENTS` (second argument, if present). Valid audiences: `eng`, `product`, `users`, `all`. If no audience specified, default to `all` (generate all three).
3. **Read `00-index.md`** — parse `title`, `slug`, `status`, `current-stage`, and `selected-slice-or-focus`.
4. **Check prerequisites and resolve ship-run artifact:**
   - Search for `.ai/workflows/<slug>/09-ship-run-*.md`. Sort by `run-id` descending; take the most recent with `go-nogo: go` or `conditional-go`. Record it as `<latest-run-path>` and capture its `run-id`. If no qualifying run exists but `09-ship.md` exists (legacy shape) → WARN: "Using legacy ship artifact — some run-level details will be missing." Use it. If neither exists but `08-handoff.md` exists → WARN: "Ship stage not completed. Generating announcement from handoff only." Proceed. If nothing exists → STOP: "No handoff or ship artifact found. Run `$wf handoff <slug>` first."
   - **Read `.ai/ship-plan.md`** if it exists. Parse `announcement.channels[]` and `announcement.template-path` into in-memory state as plan defaults. If the ship plan is absent, proceed without plan defaults (the channel question in Step 3 will have no pre-fill).
5. **Read source artifacts** (all that exist):
   - `<latest-run-path>` — deployment details, rollout strategy, go/no-go decision, version, environment, merge info, recovery actions taken
   - `08-handoff.md` — summary, problem, solution, affected areas, risks, documentation changes
   - `01-intake.md` — original motivation and business context
   - `02-shape.md` — scope, constraints, what was deliberately excluded
   - `po-answers.md` — product owner decisions and rationale

# Step 1 — Extract announcement ingredients

From the source artifacts, extract:

**What changed (facts):** the concrete deliverable (what was built, what it does); files/areas affected (eng only); dependencies added or changed (eng only).
**Why it matters (value):** the problem that existed before; how users/stakeholders are affected; business value or UX improvement.
**What to know (operational):** rollout strategy and timeline; breaking changes or migration requirements; feature flags or gradual rollout; rollback plan summary (eng only).
**What's next (forward-looking):** follow-up work planned; known limitations; feedback channels.

# Step 2 — Check docs and invoke Diátaxis primitives

Before drafting, ensure the right documentation exists to link to. Announcements that reference docs are more actionable.

**2a — Read existing docs from handoff:** Read `08-handoff.md → ## Documentation Changes`. Collect every doc path and type handoff already generated — these get linked inside the relevant announcements.

**2b — Check for doc gaps:** Read `02-shape.md` frontmatter: `docs-needed` and `docs-types`. Cross-reference against what handoff actually generated.

For each doc type planned but not generated, determine whether it is needed for announcement audiences:

| Doc type | Relevant for | Action if missing |
|----------|-------------|-------------------|
| `how-to` | Users announcement | Run `$wf docs how-to <topic>` before drafting |
| `reference` | Engineering announcement | Run `$wf docs reference <topic>` before drafting |
| `tutorial` | Users announcement (major new capability only) | Run `$wf docs tutorial <topic>` before drafting |
| `explanation` | Engineering or Product announcement | Run `$wf docs explanation <topic>` before drafting |
| `readme-update` | All audiences (if scope changed significantly) | Run `$wf docs readme` before drafting |

**2c — Invoke needed primitives:** For each missing doc type identified above, load the matching Diátaxis primitive reference and execute it inline:
- `skills/wf/reference/docs/how-to.md`
- `skills/wf/reference/docs/reference.md`
- `skills/wf/reference/docs/tutorial.md`
- `skills/wf/reference/docs/explanation.md`
- `skills/wf/reference/docs/readme.md`

Pass the primitive the feature context from the shape and handoff artifacts. Write generated docs to the location specified in the shape's doc plan, or `docs/` if unspecified. Record each generated doc path so it can be linked in the announcement.

If `docs-needed: false` or all planned docs were already generated by handoff → skip 2c entirely.

# Step 3 — Ask audience and channel questions

Ask the user directly in chat, presenting options as a short numbered list, about audience and delivery channel:
- **Audience question:** which announcement audiences to generate — a minor fix may only need engineering; a user-visible feature needs users + product. Offer "All three" as the default. Options: Engineering only, Product only, Users only, All three.
- **Channel question:** where each announcement will be sent (this shapes tone and length). Options: Slack/chat (short, scannable, emoji ok), Email (longer, formal, prose), GitHub Release (markdown with headers and code blocks), Internal wiki/Notion (structured, permanent). **Pre-fill the description with the plan's `announcement.channels[]` when present** so the user confirms rather than re-enters.

Ask one additional freeform question in chat: "Any specific points to emphasise, stakeholders to mention, or context I should include?"

**Announcement template:** If `announcement.template-path` was set in the plan and the file exists, use it as the structural scaffold, substituting `{{version}}`, `{{project-name}}`, `{{release-url}}`, `{{changelog-summary}}` from the ship-run artifact. If it does not exist, proceed without it and note the missing template in the return.

# Step 4 — Draft announcements

For each selected audience, write a tailored announcement in the voice and structure below. Link to any docs generated/found in Step 2 — a linked how-to, reference, or tutorial turns a notification into something actionable.

### Engineering announcement
**Voice:** Direct, technical, assumes full context. Respects the reader's time.
Structure: **Subject** `[Shipped] <title>` · **What shipped** (2–3 sentences, concrete) · **Technical details** (key decisions, architecture changes, new deps; reference files/modules if relevant) · **Migration / breaking changes** (or "No migration required") · **Rollout** (strategy, timeline, flags, monitoring) · **Rollback** (2–3 steps) · **Known limitations** · **Docs** (link reference/explanation docs) · **Links** (PR URL, monitoring dashboard).

### Product announcement
**Voice:** Business-oriented, outcomes-focused. No code references.
Structure: **Subject** `<title>` (framed as a capability/outcome) · **What's new** (2–3 sentences, user/business perspective) · **Why this matters** (problem solved, opportunity; connect to goals/feedback from intake/shape) · **Impact** (who benefits, metrics, UX) · **Timeline** (availability, rollout in plain terms) · **What's next** · **Docs** (link how-to/explanation) · **Action needed**.

### User-facing announcement
**Voice:** Friendly, clear, zero jargon. Shortest of the three.
Structure: **Headline** (a benefit, not a feature name) · **What changed** (1–2 sentences — what can they do now?) · **How to use it** (brief; if automatic, say so; link a how-to/tutorial prominently if generated) · **Known issues** (only if relevant) · **Feedback** (where to report).

### Channel-specific formatting
- **Slack/chat:** strip headers, bold key terms, 5–8 lines max, bullets fine, emoji ok (📦 ⚠️ 🔗).
- **Email:** subject first, prose paragraphs, headers per section, full length.
- **GitHub Release:** standard markdown, `##` headers, code blocks for commands, tag version, link PR.
- **Internal wiki/Notion:** full structured format, permanent reference.

### Writing rules (all channels/audiences)
Lead with value not implementation · active voice · no filler ("We're excited to announce" → just say what happened) · no hedging ("should improve" → "improves") · be specific (use real numbers if the artifacts have them) · scannable (bullets for 3+ items) · match length to significance · always link to docs if they exist.

# Step 5 — Write announce.md

Write `.ai/workflows/<slug>/announce.md`:

```yaml
---
schema: sdlc/v1
type: announce
slug: <slug>
created-at: "<ISO 8601 timestamp>"
audiences: [<list of audiences generated>]
channels: [<list of channels selected>]
docs-generated: [<list of doc paths generated in Step 2, if any>]
refs:
  index: 00-index.md
  ship-run: <latest-run-path>     # e.g. 09-ship-run-20260525T1400Z.md
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

# Step 5a — Update `announcements-sent` in the ship-run artifact

Read `<latest-run-path>` frontmatter. Update ONLY:
- `announcements-sent` → append the list of channels the announcements were drafted for
- `updated-at` → current ISO 8601 timestamp

Do NOT change any other field. This closes the ship→announce loop: the run artifact records which channels received the announcement, visible to retro analysis. If the legacy `09-ship.md` was used instead of a run artifact, skip this step.

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after comparison, a timeline, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../_fragment-authoring.md) Step F2 and `skills/wf/reference/narrative-fragments.md`.

# Step 6 — Update index

Read `00-index.md` frontmatter. Update ONLY:
- `updated-at` → current ISO 8601 timestamp
- Add `announce.md` to `workflow-files` if not already present
- Add any doc paths generated in Step 2 to `workflow-files` if not already present

Do NOT change `status`, `current-stage`, or any other field.

# Chat return contract
Return:
- `slug: <slug>`
- `wrote: announce.md` (plus any doc paths generated in Step 2)
- `ship-run-updated: <latest-run-path> (announcements-sent populated)` — or `skipped: legacy shape`
- `audiences:` list of generated audiences
- `channels:` list of channels selected
- `docs-generated:` list of Diátaxis docs written in Step 2, or "none"
- `announcement-template:` `used` | `missing — create at <path> before next announce run` | `not configured`
- `options:` `$wf retro <slug>` (if retro not done) · `$wf status <slug>` (full workflow state)
- ≤2 bullets: any missing context that would improve the announcements
- Reminder: "These are drafts. Review and edit before sending."
