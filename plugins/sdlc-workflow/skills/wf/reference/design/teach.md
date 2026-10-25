Help the user write or improve the design record — PRODUCT.md, DESIGN.md, `.ai/design/current.md`, and `.ai/design/direction.md` ([record.md](record.md)) — the context anchors that the design stage and every design duty read before doing work.

**The difference from `setup`**: `setup` runs a discovery interview for a fresh project. `teach` is for projects where partial context exists — when PRODUCT.md is outdated, missing key sections, or uses `[TODO]` placeholders.

Run `teach` when:
- PRODUCT.md exists but is incomplete or stale
- The user wants to add principles, brand commitments, or evidence on hand to an existing document
- DESIGN.md needs to be created from an existing product's actual visual system
- The brand or product direction has changed and context needs updating
- The design goals or the future direction in `.ai/design/direction.md` are missing or out of date

---

## Step 1: Read existing context

Read PRODUCT.md, DESIGN.md, and the two `.ai/design/` files (if they exist). Identify:
- Which sections are complete
- Which sections have `[TODO]` markers or are missing
- Which sections feel generic or non-specific to this project

## Step 2: Targeted questions (only for missing/incomplete sections)

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Ask only about what's missing. Don't re-ask about complete sections.

Before you ask any question, pre-fill the answers:

1. For each missing or incomplete section, search the user prompt, PRODUCT.md, DESIGN.md, and the codebase for an answer.
2. When a source answers a question, record the answer and the source. Do not ask that question.
3. Ask the unanswered questions in ONE batched round. Then stop and wait for the answers.
4. When no unanswered questions remain, skip the round and continue to Step 3.

Example questions:

For missing positioning:
> "What does the product make possible that a neighboring product could not truthfully claim?"

For missing evidence on hand:
> "What real content, data, testimonials, or case studies exist? Which do not exist yet?"

For missing brand commitments:
> "Which existing name, voice, or assets must future work keep?"

For missing user description:
> "Who are the primary users? What's their role, their context when they use this, and their expertise level?"

For missing goals or direction:
> "What should the design achieve in the next few releases, and where do you expect it to go after that?"

For stale content:
> "Has anything changed about the product's direction, audience, or design principles since this was written?"

Do not ask for an aesthetic direction, brand words, tone or references. `shape` asks them per surface ([brief.md](brief.md)).

## Step 3: Update the files

Update or create PRODUCT.md, DESIGN.md, and the `.ai/design/` files based on answers. Preserve all existing content; only add to or replace sections that were discussed. The `.ai/design/` templates are in [record.md](record.md).

**Templates.** PRODUCT.md and DESIGN.md use the templates in [setup.md](setup.md) Step 2 and Step 3. Do not write a `## Register` section. Keep legacy sections (Register, Brand Personality, Tone, references) until the person agrees to remove them. Report an old `## Register` once as deprecated, per [_design-context.md](_design-context.md) → Design modes. Apply [record.md](record.md) → Floor guard to every write.

## Step 4: Confirm

Present the updated files. List each pre-filled answer with its source in the same message:
> "Here's the updated context. Does this accurately represent the project? Anything to correct?"

After confirmation, set `confirmed-by: teach` in `direction.md` when it changed. These files are the anchors for every later design stage in this project.

## Notes

- Never synthesize values that no source provides — if something is unknown, mark it `[TODO: add X]`. A pre-filled answer with a recorded source is not synthesis.
- If the user wants to skip a section entirely, mark it `<!-- intentionally omitted -->` rather than removing the heading
- Commit these files to the repository — they're project-level context, not personal configuration
