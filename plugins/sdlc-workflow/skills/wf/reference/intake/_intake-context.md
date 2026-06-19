# Intake shared context

The single source of truth for the rules every `/wf intake` mode shares — the output boundary,
the narrative-fragment tier, and the workflow-registry / slug semantics. The dispatcher
(`reference/intake.md`), `intake/default.md`, and every mode reference under `intake/` defer to
this file rather than restating it. (Mirrors how the design commands defer to
`design/_design-context.md`.)

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`, `.ai/ideation/...`, `.ai/simplify/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

# Narrative fragments — any artifact
Beyond the typed `.html.fragment` the rich stages project from a sibling `.yaml`, *any* artifact a
mode writes may also ship free **narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings
of unrestricted raw HTML — as many as the story needs, no contract and no sibling `.yaml` required —
rendered raw-inline below the page. Author one whenever a bespoke diagram, flow, comparison, or
widget tells the story better than prose. Full guidance:
`${CLAUDE_PLUGIN_ROOT}/reference/narrative-fragments.md`.

# Workflow registry & slug semantics

`.ai/workflows/INDEX.md` is the global workflow registry (format documented in
`${CLAUDE_PLUGIN_ROOT}/skills/wf-meta/reference/sync.md`). Columns:
`slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`, sorted alphabetically by slug,
closed rows retained.

**Slugs are stable.** Once intake establishes a slug it never changes, and a closed slug is never
reused by a new workflow.

**Collision detection** (a *new* workflow whose derived slug already exists) is owned by
`intake/default.md` Step 0 — it prompts resume / amend / pick-different / cancel and never silently
proceeds. **This is distinct from slug-mode:** when the dispatcher detects that the *first
positional token* is an exact existing-slug match, that is an *intentional* attach handled by
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — no collision prompt fires.

**Additive bootstrap.** A mode that creates a new workflow must ensure `.ai/workflows/INDEX.md`
contains a row for its slug after `00-index.md` is finalized (create the file with the header line
if absent; append-and-resort if the slug is missing; never mutate other rows). The full procedure
and header text live in `intake/default.md` Step 10 — modes that create a workflow follow it.
