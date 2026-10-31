You are running the **announce phase** of `/wf ship` — post-publish communications. It runs at the
tail of a `go` / `conditional-go` ship run (drafting announcements from the just-written run artifact),
or on its own via `/wf ship <slug> announce` to regenerate comms without re-shipping. It writes only
`announce.md` and stamps `announcements-sent` on the ship-run; it never ships, advances the workflow,
or edits code.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·ship` → 9·retro

| | Detail |
|---|---|
| Requires | Latest `09-ship-run-<run-id>.md` with `go-nogo: go` or `conditional-go` (recommended), or at minimum `08-handoff.md`. Also reads `.ai/ship-plan.md` for Block G channel config when present. |
| Produces | `announce.md` in the workflow directory; updates `announcements-sent` in the latest ship-run artifact |
| Next | `/wf retro <slug>` (if not yet done), or workflow is complete |

# Role
You are a **communications writer**, not a developer; respect the stated order only where a step consumes an earlier step's output or crosses a gate.
- Do not modify code, workflow stage files, or any artifact other than `announce.md` (and the `announcements-sent` touch on the ship-run).
- Do not send, post, or publish announcements — only draft them. The user decides where to send.

# Step 0 — Orient

1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent shipped workflow from the index of each workflow in `.ai/workflows/` (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`, per [_records.md](../_records.md); look for `status: complete` or `current-stage: ship` or `current-stage: retro`). If ambiguous, ask the gate question per [_gate-question.md](../_gate-question.md) listing options. *(When invoked as the tail phase of a ship run, the slug and latest run are already in hand — use them.)*
2. **Resolve the audience** in Step 3. Valid audiences: `eng`, `product`, `users`, `all`. The default is `all` (all three).
3. **Read the index** (`record get "<root>" <slug> index`) — parse `title`, `slug`, `status`, `current-stage`, and `selected-slice`.
4. **Check prerequisites and resolve ship-run artifact:**
   - List the records with `record list "<root>" <slug>` and take the `09-ship-run-*.md` names. Read each with `record get "<root>" <slug> <name>` (exit 1 = absent). Sort by `run-id` descending; take the most recent with `go-nogo: go` or `conditional-go`. Record it as `<latest-run-path>` and capture its `run-id`. If no qualifying run exists but `09-ship.md` exists (legacy shape) → WARN: "Using legacy ship artifact — some run-level details will be missing." Use it. If neither exists but `08-handoff.md` exists → WARN: "Ship stage not completed. Generating announcement from handoff only." Proceed. If nothing exists → STOP: "No handoff or ship artifact found. Run `/wf ship <slug>` first."
   - **Read `.ai/ship-plan.md`** if it exists. Parse `announcement.channels[]` and `announcement.template-path` into in-memory state as plan defaults. If the ship plan is absent, proceed without plan defaults (the channel question in Step 3 will have no pre-fill).
5. **Read source artifacts** (all that exist, each with `record get "<root>" <slug> <name>`):
   - `<latest-run-path>` — deployment details, rollout strategy, go/no-go decision, version, environment, merge info, recovery actions taken
   - `08-handoff.md` — summary, problem, solution, affected areas, risks, documentation changes
   - `01-intake.md` — original motivation and business context
   - `02-shape.md` — scope, constraints, what was deliberately excluded
   - the live entries of the decision store (`decide list`, per [_decisions.md](../_decisions.md)) — product owner decisions and rationale

# Step 1 — Extract announcement ingredients

From the source artifacts, extract:

**What changed (facts):** the concrete deliverable (what was built, what it does); files/areas affected (eng only); dependencies added or changed (eng only).
**Why it matters (value):** the problem that existed before; how users/stakeholders are affected; business value or UX improvement.
**What to know (operational):** rollout strategy and timeline; breaking changes or migration requirements; feature flags or gradual rollout; rollback plan summary (eng only).
**What's next (forward-looking):** follow-up work planned; known limitations; feedback channels.

# Step 2 — Check docs and invoke Diátaxis primitives

Before drafting, ensure the right documentation exists to link to. Announcements that reference docs are more actionable.

**2a — Read existing docs from handoff:** Read `08-handoff.md → ## Documentation Changes` in the record that Step 0 read. Collect every doc path and type handoff already generated — these get linked inside the relevant announcements.

**2b — Check for doc gaps:** Read the `02-shape.md` frontmatter that Step 0 read: `docs-needed` and `docs-types`. Cross-reference against what handoff actually generated.

For each doc type planned but not generated, determine whether it is needed for announcement audiences:

| Doc type | Relevant for | Action if missing |
|----------|-------------|-------------------|
| `how-to` | Users announcement | Run `/wf docs how-to <topic>` before drafting |
| `reference` | Engineering announcement | Run `/wf docs reference <topic>` before drafting |
| `tutorial` | Users announcement (major new capability only) | Run `/wf docs tutorial <topic>` before drafting |
| `explanation` | Engineering or Product announcement | Run `/wf docs explanation <topic>` before drafting |
| `readme-update` | All audiences (if scope changed significantly) | Run `/wf docs readme` before drafting |

**2c — Invoke needed primitives:** For each missing doc type identified above, load the matching Diátaxis primitive reference of the diataxis skill and execute it inline:
- [how-to.md](../../../diataxis/references/how-to.md)
- [reference.md](../../../diataxis/references/reference.md)
- [tutorial.md](../../../diataxis/references/tutorial.md)
- [explanation.md](../../../diataxis/references/explanation.md)
- [readme.md](../../../diataxis/references/readme.md)

Pass the primitive the feature context from the shape and handoff artifacts. Write generated docs to the location specified in the shape's doc plan, or `docs/` if unspecified. Record each generated doc path so it can be linked in the announcement.

If `docs-needed: false` or all planned docs were already generated by handoff → skip 2c entirely.

# Step 3 — Ask audience and channel questions

Ask about audience and delivery channel in one round, as a gate question per [_gate-question.md](../_gate-question.md):
- **Audience question:** which announcement audiences to generate — a minor fix may only need engineering; a user-visible feature needs users + product. Offer "All three" as the default. Options: Engineering only, Product only, Users only, All three.
- **Channel question:** where each announcement will be sent (this shapes tone and length). Options: Slack/chat (short, scannable, emoji ok), Email (longer, formal, prose), GitHub Release (markdown with headers and code blocks), Internal wiki/Notion (structured, permanent). **Pre-fill the description with the plan's `announcement.channels[]` when present** so the user confirms rather than re-enters.

Ask one additional freeform question in chat: "Any specific points to emphasise, stakeholders to mention, or context I should include?"

**Announcement template:** If `announcement.template-path` was set in the plan and the file exists, use it as the structural scaffold, substituting `{{version}}`, `{{project-name}}`, `{{release-url}}`, `{{changelog-summary}}` from the ship-run artifact. If it does not exist, proceed without it and note the missing template in the return.

# Step 4 — Draft announcements

For each selected audience, write a tailored announcement in the voice and structure below. Link to any docs generated/found in Step 2 — a linked how-to, reference, or tutorial turns a notification into something actionable.

### Engineering announcement
**Voice:** Direct, technical, assumes full context. Respects the reader's time.
Structure: **Subject** `[Shipped] <title>` · **What shipped** (brief, concrete) · **Technical details** (key decisions, architecture changes, new deps; reference files/modules if relevant) · **Migration / breaking changes** (or "No migration required") · **Rollout** (strategy, timeline, flags, monitoring) · **Rollback** (the short procedure) · **Known limitations** · **Docs** (link reference/explanation docs) · **Links** (PR URL, monitoring dashboard).

### Product announcement
**Voice:** Business-oriented, outcomes-focused. No code references.
Structure: **Subject** `<title>` (framed as a capability/outcome) · **What's new** (brief, user/business perspective) · **Why this matters** (problem solved, opportunity; connect to goals/feedback from intake/shape) · **Impact** (who benefits, metrics, UX) · **Timeline** (availability, rollout in plain terms) · **What's next** · **Docs** (link how-to/explanation) · **Action needed**.

### User-facing announcement
**Voice:** Friendly, clear, zero jargon. Shortest of the three.
Structure: **Headline** (a benefit, not a feature name) · **What changed** (what can they do now?) · **How to use it** (brief; if automatic, say so; link a how-to/tutorial prominently if generated) · **Known issues** (only if relevant) · **Feedback** (where to report).

### Channel-specific formatting
- **Slack/chat:** strip headers, bold key terms, a scannable few lines, bullets fine, emoji ok (📦 ⚠️ 🔗).
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

Set ONLY `announcements-sent` on the run record: its current list plus the channels the announcements were drafted for. Run `record set "<root>" <slug> <latest-run-path> "announcements-sent=[<current entries>, <channels>]"`. `updated-at` moves by itself.

Do not change any other field. This closes the ship→announce loop: the run artifact records which channels received the announcement, visible to retro analysis. If the legacy `09-ship.md` was used instead of a run artifact, skip this step.

# Step 6 — Update index

Change ONLY `workflow-files`: add `announce.md` and any doc paths generated in Step 2 that it does not hold yet. Run `record set "<root>" <slug> index "workflow-files=[<current entries>, announce.md, <doc paths>]"`. `updated-at` moves by itself.

Do not change `status`, `current-stage`, or any other field.

# Chat return contract
Return per [_chat-return.md](../_chat-return.md) — narrative lead, then this receipt:
Return:
- `slug: <slug>`
- `wrote: announce.md` (plus any doc paths generated in Step 2)
- `ship-run-updated: <latest-run-path> (announcements-sent populated)` — or `skipped: legacy shape`
- `audiences:` list of generated audiences
- `channels:` list of channels selected
- `docs-generated:` list of Diátaxis docs written in Step 2, or "none"
- `announcement-template:` `used` | `missing — create at <path> before next announce run` | `not configured`
- `options:` `/wf retro <slug>` (if retro not done) · `/wf status <slug>` (full workflow state)
- ≤2 bullets: any missing context that would improve the announcements
- Reminder: "These are drafts. Review and edit before sending."
