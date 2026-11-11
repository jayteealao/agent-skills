# The design record interview (`design/setup.md`)

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

`/wf design record [instructions]` writes or completes the design record of the project: `PRODUCT.md`, `DESIGN.md`, `.ai/design/current.md` and `.ai/design/direction.md` ([record.md](record.md)). The words `setup` and `teach` reach the same interview. The design stage runs it when `PRODUCT.md` is missing or empty ([stage.md](stage.md) Step 1).

One rule sets the size of the interview: ask only what is missing. On a new project, that is most of the groups below. On a project with a record, it is the sections that are missing, empty, marked `[TODO]`, or that the instructions name.

`PRODUCT.md` holds product facts only. The aesthetic questions (brand words, tone, references) belong to the design brief, per surface: `shape` asks them ([brief.md](brief.md)). Do not ask for an aesthetic direction, colors, type or style here. When the person gives a binding visual constraint, record it under `## Brand Commitments` as given.

## Step 1 — Find what is missing

1. Read `PRODUCT.md`, `DESIGN.md` and the two `.ai/design/` files, when they exist. Search the project root first, then `.agents/context/`, then `docs/`.
2. List each section that is missing, empty or marked `[TODO]`, and each section that the instructions name. A section marked `<!-- intentionally omitted -->` is complete: the person skipped it, and it is not asked again unless the instructions name it.
3. For each listed section, search the prompt of the person, the four files and the code for an answer. When a source answers, keep the answer and its source, and do not ask.
4. Read the surfaces of the product from the code: the pages, the views and the reusable components, with their paths. `## Surfaces` of `current.md` needs them.

Apply the Release valve of [../_autonomy-guards.md](../_autonomy-guards.md).

## Step 2 — Ask one round

Ask the unanswered questions in one batched round per [_gate-question.md](../_gate-question.md), then wait. When nothing is unanswered, skip the round.

| Group | Questions | Fills |
|---|---|---|
| Purpose and position | What is the product for, and who uses it? What does it make possible that a neighboring product could not truthfully claim? | `## Product Purpose`, `## Positioning` |
| Users and context | Who are the primary users, in what context, with what expertise? Where and how do people use or evaluate the product? | `## Users`, `## Operating Context` |
| Brand commitments and evidence | Which name, logo, palette, type or voice must future work keep? What real content, data, testimonials or case studies exist, and which do not exist yet? | `## Brand Commitments`, `## Evidence on Hand` |
| Constraints | Which technical constraints hold (a CSS framework, a component library)? Which design documents exist (a design file, brand guidelines, tokens)? What is off-limits? | `## Capabilities and Constraints` |
| Goals and direction | What should the design achieve in the next few releases? Where does it go after that? Which parts of the current design are wrong or out of date? | `## Goals`, `## Future direction`, `## Design debt` |

When the person skips a question, mark its section `<!-- intentionally omitted -->`. Do not write `[TODO]` for a skipped question: a `[TODO]` is a gap that nobody was asked about yet.

## Step 3 — Write `PRODUCT.md`

Write `PRODUCT.md` in the project root. Write only confirmed facts, and open decisions marked as open. When the file exists, change only the sections of this run, and keep the others. Never write a value that no source gives.

```markdown
# Product

## Users
[Primary users, their situation, and the job they do. Add other audiences only when confirmed.]

## Product Purpose
[What the product does, why it exists, and what success means.]

## Positioning
[The mechanism or claim that a neighboring product could not truthfully copy.]

## Operating Context
[The workflows, environments, tools and documents that are part of using or evaluating the product.]

## Capabilities and Constraints
[Confirmed functions, technical constraints, terminology, and product facts that are still undecided.]

## Brand Commitments
[Existing name, voice, assets, personality, and references the person made binding. Omit when none exist.]

## Evidence on Hand
[Real content, data, demonstrations, testimonials, case studies and assets, with paths. State each absence that future work must not fabricate.]

## Strategic Principles
[Two to four durable principles on priorities and trade-offs. No visual recipes.]
```

Do not write a `## Register` section: the design mode is chosen per surface ([_design-context.md](_design-context.md) → Design modes). An older `PRODUCT.md` keeps its legacy sections (Register, Brand Personality, Tone, references) until the person agrees to remove them. Report an old `## Register` one time as deprecated.

## The DESIGN.md template

Write `DESIGN.md` in the project root, with no frontmatter. When the file exists, change only the sections of this run. Fill the token roles that a source gives. The design stage fills the rest at its foundation step ([stage.md](stage.md) Step 3c). With no design information yet, write the headings and one line that says the design stage fills them.

Give each role its own row, with one name in the Role cell: `wf.mjs design tokens` skips a row that holds several names, and says so. A value is a value, never a sentence: the command refuses a row whose value is no value of its kind (a color, a length with its unit, a weight, a duration). For themes, replace the `Value` column with one column per theme, the default first, each with its color scheme in brackets: `| Role | Token | Light (light) | Dark (dark) | Used for |`. Leave a cell empty when a theme keeps the default value. Name the token file of the product code in the Overview (`Token file: <path>`): the command writes it for Kotlin, Swift, TypeScript, JavaScript and CSS.

```markdown
# Design

## Overview
[The personality, density and aesthetic stance of the system, in two or three paragraphs. State only confirmed rejections. Token file: <path, or none>.]

## Colors
[The palette character in one sentence. Each color with its value (hex or oklch), its name and where it is used. Light and dark support.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| ground | | | page background |
| surface | | | raised panels and cards |
| text | | | body text |
| text-secondary | | | secondary text |
| accent | | | primary action, current selection |
| border | | | dividers and control outlines |
| focus | | | focus ring |
| error | | | state color: error |
| warning | | | state color: warning |
| success | | | state color: success |
| info | | | state color: info |

## Typography
[Families with fallbacks. The hierarchy roles (display, headline, title, body, label) with weight, size and line height. The body measure.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| font-body | | | body text |
| font-display | | | headings |
| font-mono | | | code and numbers |
| text-xs | | | captions |
| text-sm | | | small text |
| text-md | | | body size |
| text-lg | | | large text |
| text-xl | | | headings |

## Layout
[The grid or spatial model, container behavior, density, responsive changes, and the spacing rhythm.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| space-1 | | | the smallest step of the spacing scale |
| space-2 | | | the second step |
| space-3 | | | the third step |
| space-4 | | | the fourth step |
| space-5 | | | the fifth step |
| space-6 | | | the sixth step |
| size-target | | | the smallest touch or click target |
| size-control | | | the height of a control |
| size-icon | | | an icon |

## Elevation & Depth
[Shadows, tonal layers, or both. With no shadows, say how depth shows.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| shadow-raised | | | raised panels |
| shadow-overlay | | | menus, sheets and dialogs |

## Shapes
[The radius strategy, borders, clipping, and recurring geometry.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| radius-sm | | | controls |
| radius-md | | | panels |
| radius-lg | | | sheets and dialogs |
| radius-full | | | pills and avatars |

## Motion
[Durations and easings, and what moves. With no motion, say so and leave the table out.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| duration-fast | | | hover and press feedback |
| duration-base | | | panels and sheets |
| ease-standard | | | most movement |

## Components
[The component library, if any, and the icon library. For each main component (buttons, inputs, cards, navigation): its job, its variant dimensions, its states and the token roles it uses. The machine spec of each component is in its page (`wf:variants`, `wf:states`): keep this section in words.]

## Do's and Don'ts
[Concrete guardrails from the existing system or the choices of the person. Start each with "Do" or "Don't".]
```

## Step 4 — Write the `.ai/design/` files

Write `.ai/design/current.md` and `.ai/design/direction.md` from the templates of [record.md](record.md). The goals group fills `## Goals` and `## Future direction`. The surfaces of Step 1 fill `## Surfaces`. The known problems fill `## Design debt`. Apply [record.md](record.md) → Floor guard to every write.

## Step 5 — Confirm in chat

The person does not open the files. Send one message that holds the record in plain words:

1. One short paragraph for each part that changed: what it now says.
2. Each answer that you took from a source, with the source.
3. Each section that stays open, and why.

Then ask one gate question: the record is right, or name a correction. On a correction, change the files and send the changed lines. After the confirmation, set `confirmed-by: record` in `direction.md`, when that file changed.

Chat return: the parts that changed, and the next step. When a design stage waits for the record, the next step is "Type `/wf design <slug>`." Otherwise it is `Done`. The four files are project files: the person commits them with the repo.
