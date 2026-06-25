# Brief (design-brief authoring procedure)

Author the **design brief**: a structured artifact that guides UI implementation through discovery, not guesswork. This is **not a standalone command** — it is the brief-authoring procedure that the `craft` Producer runs as its first step (`craft.md` Step 0, this directory) before writing the visual contract. It produces `02b-design.md`.

**Scope**: Design planning only. This procedure does NOT write code. It produces the thinking that makes code good.

## Philosophy

Most AI-generated UIs fail not because of bad code, but because of skipped thinking. They jump to "here's a card grid" without asking "what is the user trying to accomplish?" Shape inverts that: understand deeply first, so implementation is precise.

A sparse prompt is not a brief. Do **not** synthesize a complete brief for confirmation on the first response. Discovery requires at least one user-answer round.

## Phase 1: Discovery Interview

Do NOT write any code or make any design decisions during this phase. Your only job is to understand the feature deeply enough to make excellent design decisions later.

This is a required interaction. Ask questions in conversation, adapting based on answers. Don't dump them all at once — have a natural dialogue. Ask 2–3 questions per round, then stop and wait for answers.

### Round 1 — Purpose and context
- What is this feature for? What problem does it solve?
- Who specifically will use it? (Role, context, frequency — not "users")
- What does success look like?
- What's the user's state of mind when they reach this feature? (Rushed? Exploring? Anxious?)

### Round 2 — Content and states
- What content or data does this feature display or collect?
- What are the realistic ranges? (0 items / 5 items / 500 items)
- What are the edge cases? (Empty state, error state, first-time use, power user)
- Is any content dynamic? What changes and how often?

### Round 3 — Visual direction and scope (ask only what's missing from PRODUCT.md/DESIGN.md)
- **Color strategy for this surface**: Restrained / Committed / Full palette / Drenched — can override the project default if the surface earns it
- **Scene sentence**: One sentence of physical context — who uses this, where, under what ambient light, in what mood. The sentence forces dark vs light. If it doesn't, add detail until it does.
- **Two or three named anchor references**: Specific products, brands, objects — not adjectives
- **Scope**: sketch quality vs. shipped quality — don't guess between them

## Phase 2: Design Brief

Write the design brief after collecting answers. Sections:

### 1. Feature summary
Two sentences: what it is and what problem it solves.

### 2. User and context
Specific user description, their task context, their emotional state at arrival.

### 3. Content inventory
List of content elements, edge cases, and state variants (empty, error, loading, first-run).

### 4. Visual direction
- Color strategy chosen (and why it fits this surface)
- Scene sentence (confirmed by user or inferred)
- Register: brand or product — explain the determination
- Two or three named anchor references with brief rationale
- Anti-goals: what this should NOT look like

### 5. Scope and fidelity
What level of completeness is expected. States to cover.

### 6. Recommended references

Which reference docs from `skills/wf/reference/design/` should be loaded for implementation:
- `typeset.md` — always
- `animate.md` — if transitions/motion needed
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is a concern
- `optimize.md` — if performance is a concern

**Mirror this list as a `recommended-references:` array in `02b-design.md`'s YAML frontmatter** so `$wf implement` can resolve it deterministically:

```yaml
recommended-references: [typeset, animate, colorize, harden]
```

Names omit the `.md` extension. `$wf implement` reads each as `skills/wf/reference/design/<name>.md` and treats the loaded files as read-only design rationale during implementation. The frontmatter array is authoritative; the human-readable bullet list above is for the design reviewer's eye and may include conditional notes that the array does not.

## Phase 3: Visual Direction Probes (capability-gated)

After the scene sentence is confirmed, generate north-star image probes when image generation is available. These are direction artifacts, not implementation assets.

### When to run probes

Run probes when:
- The work is net-new or visually open-ended
- Brief scope is sketch, mid-fi, high-fi, or production-ready
- Image generation is available in the current environment

Do NOT skip probes because "the implementation will be semantic HTML" or "a raster mock won't be used directly." The probes establish visual direction; the code comes after.

### How to run probes

Construct 2–3 prompt variants from the confirmed scene sentence and brief:
- **Variant A** — literal interpretation of the scene sentence
- **Variant B** — elevated/editorial interpretation of the same scene
- **Variant C** — a contrast direction (different mood or palette)

Invoke the `imagery` skill for each variant (it infers the output path under
`.ai/design-probes/` and reports it back — no flags):
```
imagery "<variant A prompt>"
imagery "<variant B prompt>"
imagery "<variant C prompt>"
```
(Bare `imagery` fans out to every available backend — free built-in `image_gen`
always, plus any opted-in API backends. Pin one for a single image per variant,
e.g. `imagery gemini "<variant A prompt>"`.)

Present results and ask the user directly in chat to choose a direction, or say 'skip' to proceed text-only.

Record the user's choice in the design brief under `## Visual Direction` → `Probe selection`.

If imagery returns `method=text-only`: record the scene sentence + prompt template in the brief, set `image_gate=skipped:no-method-available`, and proceed.

## Phase 4: Confirm brief

Present the complete design brief and ask the user directly in chat:
> "Does this brief accurately capture the intent? Any corrections before I hand this to implementation?"

Wait for explicit confirmation. Do NOT proceed to implementation until the user confirms.

**`shape=pass`** is only valid after a separate user response approving the brief. A self-authored brief without user confirmation does not pass the gate.

## Output

When `craft` runs this procedure (`craft.md` Step 0):
- Write the confirmed brief to `.ai/workflows/<slug>/02b-design.md` (type `design`).
- Update `00-index.md`: `current-stage: design`.
- Return control to `craft`, which writes the visual contract and then drives the build — there is no hand-back and no separate `shape` command.
