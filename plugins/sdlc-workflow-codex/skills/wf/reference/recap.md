---
description: Recap or explain a workflow in plain understandable language. Give it a slug to recap the whole workflow, a slug and a slice to recap one slice, or a slug and a focus (plan, shape, review, findings) to explain that artifact. Reads the trail and tells the story — what was decided, built, checked, and where it stands. Does not advance the workflow.
argument-hint: "<slug> [slice-slug | plan | shape | slice | review | findings]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.codex/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `recap`, the **plain-language catch-up** command for the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

Recap tells you **what has been done so far** on a workflow, in language a human can read and understand — not a terse machine brief. It reads the trail and narrates the work: what was decided and why, what got built, what was checked, and where things stand right now. Its second argument selects scope:

- **nothing** → recap the whole workflow.
- **a slice-slug** → recap just that slice's journey.
- **a focus keyword** (`plan` · `shape` · `slice` · `review` · `findings`) → **explain that artifact** in plain language — what it says, what it commits to, and what it implies. This is the "help me understand my own plan / review findings" mode (folded in from the former `how` command's workflow-explain and findings-explain modes). *General code questions, codebase architecture, and web research are NOT recap's job — those belong to the `$deep-research` skill.*

This command does NOT advance the workflow, run a stage, or change any code. The thing that *continues* the work is `$wf auto`, `$wf yolo`, or the specific next stage — recap only tells the story of what already happened.

# CRITICAL — execution discipline
You are a **storyteller of the work done**, not a problem solver.
- Do NOT advance the workflow, fix issues, write code, or start any stage.
- Do NOT modify any workflow files except `90-recap.md`.
- Your job is to **read the trail and retell it understandably** — someone who has been away, or has never seen this workflow, should finish the recap knowing what happened and where it stands.
- Favor **clarity over compression**. This is not a token-minimised sub-agent brief; it is a readable catch-up. Be tight — no filler — but never sacrifice understandability to hit a word count.
- Follow the numbered steps below **exactly in order**.
- If you catch yourself about to start working on the project, STOP. Output the recap and nothing else.

# Step 0 — Resolve scope

`$ARGUMENTS`: the first token is the **slug**; an optional second token is a **slice-slug**.

1. **Resolve the slug (required).**
   - If `$ARGUMENTS` provides a slug → use it. Verify `.ai/workflows/<slug>/00-index.md` exists. If it does not → STOP: *"No workflow `<slug>` found. Run `$wf status` to list workflows."*
   - If no slug is given → this command is slug-first. Try to infer: if `.ai/workflows/INDEX.md` exists, read it and filter rows whose status is not `closed`; if **exactly one** non-closed row exists, use it and note the inference in the recap header. If **multiple**, list them (`slug — status — updated-at`) and ask which one in chat. If **none** → STOP: *"No workflows found. Start one with `$wf intake <description>`."*

2. **Resolve the second token (optional).** Resolve in this order:
   - **No second token** → **whole-workflow recap** (Steps 1–3).
   - **Exact slice-slug match** — `.ai/workflows/<slug>/03-slice-<token>.md` exists → **slice recap**
     (Steps 1–3, slice-scoped). Slice match is checked FIRST so a slice literally named `plan`/`review`
     still recaps.
   - **Focus keyword** — `token` ∈ `{plan, shape, slice, review, findings}` and no slice matched →
     **explain mode** (Step E). This explains the named artifact rather than recapping the whole
     journey.
   - **Neither** → STOP: *"`<token>` is not a slice of `<slug>` or a focus keyword (plan/shape/slice/
     review/findings). Run `$wf recap <slug>` for the whole-workflow recap, or `$wf status <slug>` to
     see its slices."*

# Step 1 — Read the trail

Read what actually exists — do not infer from filenames.

**Whole-workflow recap (slug only):**
1. `00-index.md` — parse `title`, `slug`, `status`, `current-stage`, `stage-number`, `updated-at`, `selected-slice-or-focus`, `open-questions`, `recommended-next-invocation`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `progress`, `workflow-files`.
2. Every stage file listed in `workflow-files` (or search `.ai/workflows/<slug>/*.md`). For each, read frontmatter and scan the body for: the scope and acceptance criteria (intake/shape), how the work was split (slice), the approach taken (plan), what was actually built and any deviations (implement), what was checked and the result (verify), findings still open (review), what shipped (handoff/ship), and lessons (retro).
3. `po-answers.md` — the product-owner decisions that constrain the work. Keep the ones that still matter; drop superseded ones.
4. If slices exist, search for `03-slice-*.md` / `04-plan-*.md` / `05-implement-*.md` / `06-verify-*.md` / `07-review-*.md` to build the slice-by-slice progress picture.

**Slice recap (slug + slice):** read `00-index.md` and `02-shape.md` for context, then focus on that slice's own trail — `03-slice-<slice>.md`, `04-plan-<slice>.md`, `05-implement-<slice>.md`, `06-verify-<slice>.md`, `07-review-<slice>.md` (whichever exist), plus any slice amendments/compressed-slice notes. Read `po-answers.md` entries tagged to this slice. Ignore the other slices except where this slice depends on them.

**Branch state** (if `branch-strategy: dedicated`): run `git branch --show-current`; note if the user is on the wrong branch.

# Step 2 — Write the recap

Write it in the voice defined in [_narrative-voice.md](_narrative-voice.md): relevance first, why before how, plain concrete language, tradeoffs stated plainly, no "This stage implements…" openings. The reader should be able to read top to bottom and come away understanding the work — not decode a status table.

**Structure — whole-workflow recap:**

```markdown
# Recap: <title>
<slug> · stage <N>·<stage-name> · <status> · updated <YYYY-MM-DD>
Branch: <branch> (base <base-branch>) · PR: <pr-url or "none">

## What this is
1–3 sentences in plain language: the problem being solved and who it's for. No jargon.

## The story so far
The heart of the recap — a short narrative (prose, not a dump of the stage files) walking through
what has happened: what was decided at intake/shape and why, how the work was split into slices, the
approach the plan took, what has actually been built, and what has been checked or reviewed. Name the
load-bearing decisions and the reasons behind them. Write it like catching up a colleague who's been
away for two weeks — enough that they understand not just *what* was done but *why* it was done that
way. Reference specifics (a decision, a constraint, a finding) rather than gesturing vaguely.

## Where it stands now
What is finished, what is in progress, and what hasn't been started. Be concrete: if implementing,
which slice and roughly where; if verifying, what passed and what failed; if reviewing, what's still
open.

## Slice progress
Only if the workflow is sliced. A quick table so the state is scannable alongside the prose.

| Slice | Plan | Impl | Verify | Review | Handoff | Ship |
|-------|------|------|--------|--------|---------|------|

(✓ done · → in progress · ✗ failed/blocked · · not started)

## What you need to know
The non-obvious decisions and constraints someone picking this up MUST respect — "migration must be
reversible", "can't touch auth until slice X lands", "the external API caps at 100/min". Include open
questions and active blockers here (or "None").

## What's left
The remaining work in plain terms, then the concrete next command.
`<recommended-next-invocation>` — one-line reason.
If on the wrong branch: ⚠ You are on `<current>` — switch to `<branch>` first.
```

**Structure — slice recap (slug + slice):** same voice, narrowed to the one slice. Drop the
cross-slice table. Lead with what this slice is *for* (its goal and how it fits the whole), then "The
story so far" for this slice only (its plan approach → what was built → what was verified/reviewed),
then its current status, its acceptance-criteria status (met / not-met / untested, per criterion),
what you need to know, and the next command scoped to this slice.

Length follows the work: an early or single-slice workflow may only need a couple hundred words; a
deep multi-slice one with open findings will need more. Let understandability set the length, not a
cap — but every sentence should carry a fact or a reason, never filler.

# Step E — Explain mode (focus keyword)

Runs *instead of* Steps 1–2 when the second token is a focus keyword. You are explaining one artifact
to the person who created it — they know their project; they want to understand what the artifact
captures, what it locks in, and what it implies. Same understandable voice as recap; no code changes,
no advancing the workflow.

1. **Read the target** (and just enough context to explain it):

   | Focus | Read |
   |---|---|
   | `plan` | `00-index.md`, `02-shape.md`, `04-plan.md` + every `04-plan-<slice>.md`, `po-answers.md` |
   | `shape` | `00-index.md`, `01-intake.md`, `02-shape.md`, `po-answers.md` |
   | `slice` | `00-index.md`, `02-shape.md`, `03-slice.md` (+ a named `03-slice-<slice>.md` if the user also gave one) |
   | `review` | every `07-review-*.md`, plus `02-shape.md` for the acceptance criteria the review was against |
   | `findings` | every `07-review-*.md` **and** `06-verify-*.md` (+ `verify-evidence/`), plus `05-implement-*.md` and `02-shape.md` for context |

2. **Write the explanation** in the recap voice. Structure for `plan`/`shape`/`slice`:

   ```markdown
   # Explain: <slug> · <focus>

   ## What it says
   Plain-language summary of what this artifact captures. The reader knows the project — surface what
   the artifact commits that isn't obvious from memory, not a re-read of domain basics.

   ## What it locks in
   The decisions, constraints, scope boundaries, and acceptance criteria this artifact fixes.

   ## Why (where recorded)
   Rationale from po-answers / shape context. Where rationale is missing, say so plainly.

   ## What it implies next
   What the next stage must know or respect — non-obvious dependencies, ordering, constraints.
   ```

   For `review`/`findings`, structure around the findings instead: **Finding summary** (plain-language
   meaning of each, keeping its ID + severity), **Why it matters** (concrete risk for each HIGH/BLOCKER),
   **What it'd take to fix** (scope signal, not code), **Related clusters** (findings sharing a root
   cause), **Recommended order** (BLOCKER → HIGH → clusters → isolated MED/LOW).

3. Continue to Step 3 to save and return — explain mode writes the same `90-recap.md` artifact with
   `scope: explain` and `focus: <keyword>` in the frontmatter.

# Step 3 — Save and return

1. **Timestamp:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"`.
2. **Write `.ai/workflows/<slug>/90-recap.md`** with this frontmatter, followed by the recap body:

```yaml
---
schema: sdlc/v1
type: recap
slug: <slug>
scope: <workflow | slice | explain>
slice: "<slice-slug or empty>"
focus: "<plan|shape|slice|review|findings or empty>"
generated-at: "<iso-8601>"
current-stage: <stage-name>
stage-number: <N>
status: <status>
refs:
  index: 00-index.md
---
```

3. **Return the recap in chat.** The chat output IS the recap — no preamble, no "here's your recap",
   no restating the frontmatter. Just the readable recap itself, so the user gets the whole story in
   one read. The `## What's left` section carries the routing; do not add a separate options footer.
