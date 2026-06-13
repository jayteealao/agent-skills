# sdlc-workflow Documentation Site — Plan

Status: draft, pre-build
Author: planning conversation, 2026-05-10
Target output: `plugins/sdlc-workflow/docs/site/` — a multi-page static HTML site
References:
- `plugins/sdlc-workflow/README.md` — current single-file docs (long, dense)
- `plugins/sdlc-workflow/CHANGELOG.md` — v9.5.0 entry has the latest behaviour
- `plugins/sdlc-workflow/skills/wf-docs/reference/*.md` — Diátaxis primitives we will follow
- Diátaxis framework: https://diataxis.fr

---

## 1. Goals

### 1.1 What the site must do

1. **Onboard a new user end-to-end.** A developer who has never used the plugin should reach "I shipped something with `/wf`" within one tutorial.
2. **Cover every command and skill at reference depth.** The site is the authoritative answer to "what does this command do, what does it read, what does it write, when do I use it."
3. **Explain the conceptual model.** Orchestrator discipline, artifacts-over-memory, adaptive routing, branch strategy — the *why* behind the *how*.
4. **Be searchable by task.** "How do I X" must land on a focused how-to page.
5. **Include visualizations.** Pipeline flow, decision trees for entry-point choice, state machines for ship runs, sequence diagrams for the triage loop.
6. **Include escape hatches and anti-patterns.** When *not* to use the workflow; when to bypass it; what mistakes the plugin invites.

### 1.2 Non-goals

- Not a marketing site. No screenshots of the IDE, no testimonials.
- Not a Claude Code tutorial. We assume the reader has Claude Code installed and the plugin loaded.
- Not a substitute for `--help`. Each command's flag list belongs in the slash command itself.

---

## 2. Design decisions (settled)

| Decision | Choice | Rationale |
|---|---|---|
| Layout shape | **Multi-page static HTML** under `plugins/sdlc-workflow/docs/site/` | Bundles with the plugin, no build step, hostable on GitHub Pages, opens directly in browser. |
| Structure | **Diátaxis** — four quadrants + landing + tips | Maps cleanly to user-need-at-moment-of-reading; the plugin already preaches Diátaxis, so the docs should practice it. |
| Diagrams | **Mermaid via CDN** | Markdown-compatible, also renders inline in HTML via `<script>` tag. No build step. Falls back to source text if CDN unreachable. |
| Styling | **Hand-written `style.css`**, system-font stack, single column with sidebar nav on wide viewports | Lightweight, predictable, prints well, no theme framework to learn. |
| Navigation | **Persistent left sidebar** + breadcrumb + prev/next links + in-page TOC for long pages | Three navigation surfaces because users land from different starting points (search, share-link, click-through). |
| Cross-linking | **Every page links to its 1-3 nearest siblings in the other Diátaxis quadrants** | Reader on a how-to should be one click from the reference and explanation that back it. |
| Code rendering | **Plain `<pre><code>`** with prism.js or highlight.js via CDN | Syntax highlighting without a build pipeline. |
| Search | **Pagefind** (build-time index) **or** browser-only fuzzy search via `lunr` CDN | Decide during build phase; ship-without-search if it adds friction. |
| Accessibility | **Semantic HTML, keyboard nav, alt text on diagrams, prefers-color-scheme dark mode** | Standard. The site teaches code-review for accessibility — must not fail its own audit. |

---

## 3. Information architecture

```
docs/site/
├── index.html                                   # Landing — pitch + site map
├── style.css                                    # Single shared stylesheet
├── nav.html                                     # Sidebar nav fragment (included in every page)
├── tutorials/
│   ├── installation.html                        # Install + verify the plugin loads
│   ├── first-workflow.html                      # Full lifecycle on a small feature (longest page)
│   └── quick-fix-workflow.html                  # `/wf-quick` for trivial changes
├── how-to/
│   ├── start-workflow.html                      # Picking the right entry point
│   ├── navigate-workflows.html                  # wf-meta next/status/resume/sync
│   ├── amend-or-extend.html                     # Corrections + new scope
│   ├── use-augmentations.html                   # instrument/experiment/benchmark/profile
│   ├── triage-pr-comments.html                  # The new T5.1 loop
│   ├── author-ship-plan.html                    # /wf-meta init-ship-plan
│   ├── run-a-release.html                       # /wf ship walkthrough
│   ├── resume-paused-work.html                  # Resume after break / failed ship
│   └── close-workflows.html                     # close + skip
├── reference/
│   ├── pipeline.html                            # All 10 stages — read/write contract
│   ├── commands.html                            # Every slash command, args, behaviour
│   ├── skills.html                              # Every skill router, sub-commands
│   ├── artifacts.html                           # Every artifact file, its frontmatter
│   ├── 00-index-schema.html                     # The control file
│   ├── ship-plan-schema.html                    # The plan schema, all 7 blocks
│   ├── 08-handoff-schema.html                   # Handoff frontmatter incl. PR-readiness fields
│   ├── 09-ship-run-schema.html                  # Per-release artifact
│   ├── hooks.html                               # validate-workflow-write, auto-stage, etc.
│   └── glossary.html                            # Vocabulary index
├── explanation/
│   ├── why-this-exists.html                     # The problem the plugin solves
│   ├── artifacts-over-memory.html               # Core idea
│   ├── orchestrator-discipline.html             # Why stages don't bleed into each other
│   ├── diataxis-integration.html                # Docs framework alignment
│   ├── branch-strategy.html                     # dedicated/shared/none
│   ├── adaptive-routing.html                    # Why every stage offers multiple next options
│   ├── augmentations-model.html                 # How perf/observability slots in
│   ├── idempotency-in-ship.html                 # Replayable releases
│   └── the-readiness-gate.html                  # Handoff → ship contract
└── tips/
    ├── escape-hatches.html                      # When to bypass / skip-to / hotfix
    ├── tricks.html                              # Power-user moves
    ├── anti-patterns.html                       # What the plugin doesn't fix; what it can mask
    └── faq.html                                 # Common questions
```

**Page count: 32.** Reasonable: each page covers one cohesive topic, none is so long it can't be read in one sitting.

---

## 4. Diátaxis mapping rules (settled)

Each page declares its quadrant in a header banner. The page format follows the rules of that quadrant.

### Tutorials
- Imperative voice ("Now run `…`")
- Pre-conditions stated up front
- Every step has an expected observable outcome ("you should see…")
- No optional digressions; if it's optional, link out
- One concrete worked example, end-to-end

### How-to guides
- Task-oriented title ("How to amend a workflow when review found a spec error")
- Pre-conditions + the goal stated up front
- Numbered steps; each step is one observable action
- Variations as separate steps, not branches inside a step
- Links to reference for argument details

### Reference
- Information-oriented title (just the noun: "`/wf ship`", "`08-handoff.md`")
- Frontmatter-style summary table
- Exhaustive coverage; no opinions
- No "first do X, then Y" prose — that's how-to territory

### Explanation
- Title is a noun phrase about the concept ("Adaptive routing")
- Discursive prose
- Compares alternatives, gives historical context, surfaces trade-offs
- May reference how-to / reference but doesn't substitute for them

---

## 5. Visualizations (settled list)

Each diagram is authored in Mermaid in-line in the relevant HTML page. Source is checked in. CDN fallback shows the source as a code block.

| # | Page | Diagram | Type |
|---|---|---|---|
| 1 | `index.html` | The 10-stage pipeline + skip-to arrows | flowchart |
| 2 | `tutorials/first-workflow.html` | Sequence of stages for a worked example | sequence |
| 3 | `how-to/start-workflow.html` | Decision tree: which entry point? | flowchart |
| 4 | `how-to/triage-pr-comments.html` | T5.1 loop, classify → fix → resolve | sequence |
| 5 | `how-to/run-a-release.html` | 13-step ship-run state machine | state |
| 6 | `how-to/resume-paused-work.html` | Resume detection + branch points | flowchart |
| 7 | `reference/pipeline.html` | Stage I/O graph — which artifact reads which | flowchart |
| 8 | `reference/artifacts.html` | Per-stage artifact tree under `.ai/workflows/<slug>/` | tree |
| 9 | `explanation/branch-strategy.html` | dedicated vs shared vs none | flowchart |
| 10 | `explanation/idempotency-in-ship.html` | Step-N already-done detection | flowchart |
| 11 | `explanation/the-readiness-gate.html` | Handoff fields → readiness-verdict computation | flowchart |
| 12 | `explanation/augmentations-model.html` | How an augmentation registers + propagates | flowchart |
| 13 | `reference/commands.html` | Slash command → skill router → reference body call graph | flowchart |
| 14 | `tips/escape-hatches.html` | Workflow-required vs workflow-optional decision tree | flowchart |

Each diagram caption: one sentence describing what to look at + one sentence describing what conclusion to draw. No diagram is decorative.

---

## 6. Build + delivery

### 6.1 Build

There is no build step. The HTML is hand-authored. The sidebar nav is repeated in every page (literal copy-paste — generation in a build step is overengineering for 32 pages).

To regenerate the sidebar across all pages after a change: a small `tools/regen-nav.sh` script that finds `<nav id="sidebar">…</nav>` blocks and replaces them with the content of `nav.html`. Optional; only added if it becomes painful.

### 6.2 Local preview

```
cd plugins/sdlc-workflow/docs/site
python3 -m http.server 8000
# Open http://localhost:8000
```

Or `npx serve .` for those without Python.

### 6.3 Hosting

The site is committed to the repo and works as-is over `file://`. For a public host:
- GitHub Pages — set source to `/plugins/sdlc-workflow/docs/site/`
- Any static host (Netlify, Cloudflare Pages) — same directory

### 6.4 Versioning

The site documents the *current* plugin version (read from `plugin.json`). When the plugin's behaviour changes materially, the affected pages are updated in the same PR. Old versions of the docs live in git history; we don't maintain a version selector.

---

## 7. Content drafts (per page, one-sentence pitch)

### Tutorials
- **installation.html** — "Install the plugin, verify the skills loaded, run `/wf-meta status` to confirm the harness is wired up."
- **first-workflow.html** — "Ship a small feature end-to-end: intake → shape → slice → plan → implement → verify → review → handoff → ship → retro. Worked example: adding a `/health` endpoint to a fictional server."
- **quick-fix-workflow.html** — "Use `/wf-quick fix` for a typo correction. Three artifacts instead of ten."

### How-to
- **start-workflow.html** — "Decide whether the change wants `/wf`, `/wf-quick fix`, `/wf-quick hotfix`, `/wf-quick refactor`, `/wf-quick update-deps`, or `/wf-quick investigate`."
- **navigate-workflows.html** — "Find what you were doing (`status`), pick it up (`resume`), figure out what's next (`next`), repair drift (`sync`)."
- **amend-or-extend.html** — "When the review or retro reveals the spec was wrong, `amend`. When new scope appears, `extend`. Don't reach for `implement` — that fixes bugs, not specs."
- **use-augmentations.html** — "Add observability, experimentation, benchmarking, or profiling to a slice. Augmentations register on `00-index.md` and propagate to downstream stages."
- **triage-pr-comments.html** — "When CodeRabbit, Greptile, Gemini, or a human reviewer leaves comments, run `/wf handoff <slug>` again — the PR-readiness block now triages them in a bounded loop."
- **author-ship-plan.html** — "Run `/wf-meta init-ship-plan --from-template <kind>` once per project. Pick the template that matches how you release."
- **run-a-release.html** — "After handoff says `readiness-verdict: ready`, run `/wf ship <slug>`. Walk through the 13 idempotent steps."
- **resume-paused-work.html** — "A workflow goes quiet for two weeks. A ship run pauses on a failing post-publish check. Both resume the same way: `/wf-meta resume <slug>` or `/wf ship <slug>` (which detects paused runs)."
- **close-workflows.html** — "When you're done — shipped, abandoned, superseded, archived, or stuck — close cleanly so the index reflects reality."

### Reference
- **pipeline.html** — "Every stage: name, position, requires, conditional inputs, produces, next, skip-to."
- **commands.html** — "Every slash command: arguments, what it reads, what it writes, when to use it."
- **skills.html** — "Every skill router: sub-commands, when the model auto-invokes vs explicit dispatch."
- **artifacts.html** — "Every artifact filename: schema, type, required frontmatter, body sections."
- **00-index-schema.html** — "The control file. Every field, every value, when it's required."
- **ship-plan-schema.html** — "All 7 blocks (A–G) of `.ai/ship-plan.md`. Every key, every value range."
- **08-handoff-schema.html** — "The handoff artifact, including the PR-readiness block fields."
- **09-ship-run-schema.html** — "The per-release artifact. Every evidence field, when it's set, what `status` values mean."
- **hooks.html** — "The pre-write validator, auto-stage, pre-compact, and workflow-discovery hooks."
- **glossary.html** — "Slug, slice, stage, augmentation, artifact, primitive, router, dispatch, freshness pass, External Output Boundary, readiness verdict, plan-version-at-run."

### Explanation
- **why-this-exists.html** — "AI conversations have no memory. Decisions vanish with the context window. The plugin makes them durable."
- **artifacts-over-memory.html** — "The artifact files are the state. The conversation is just the latest interaction with them."
- **orchestrator-discipline.html** — "Each stage is an orchestrator, not a problem-solver. Why this constraint matters and what it prevents."
- **diataxis-integration.html** — "How the plugin applies the four-quadrant framework across the lifecycle, and what each stage contributes to the documentation outcome."
- **branch-strategy.html** — "`dedicated` is the default; `shared` for collaborative branches that can't be force-pushed; `none` for documentation-only or local-only work."
- **adaptive-routing.html** — "Why every stage offers Options A/B/C/D rather than a single 'next'. The shape of a fast-path workflow vs a deliberate one."
- **augmentations-model.html** — "Instrument/experiment/benchmark/profile register on the index and produce type-specific deliverables. How the registration propagates."
- **idempotency-in-ship.html** — "Why every step in the ship run is independently re-runnable. The detection-before-side-effect pattern."
- **the-readiness-gate.html** — "The contract between handoff and ship: `readiness-verdict: ready` is the only state ship will accept. How that verdict is computed."

### Tips
- **escape-hatches.html** — "When skip-to is correct. When to use `/wf-quick` instead of `/wf`. When to abandon a workflow entirely."
- **tricks.html** — "Parallel sub-agent dispatch in `review`. Letting `wf-how` plan your unfamiliar-subsystem reading. Re-running handoff to refresh PR triage."
- **anti-patterns.html** — "Letting the plan and implement files drift. Treating BLOCKER findings as suggestions. Skipping retro on 'small' work."
- **faq.html** — "Why does ship refuse to start? Why didn't my augmentation propagate? Why is my slug different from my title?"

---

## 8. Phasing — tasks

The site is built in **6 phases**. Each phase produces something usable independently.

### Phase 1 — Scaffolding
- Create `docs/site/` directory tree
- Write `style.css` (typography, sidebar, code blocks, dark mode, print)
- Write `nav.html` (canonical sidebar source)
- Write `index.html` (landing + site map + pipeline mermaid)
- Verify pages render in browser via `file://`

### Phase 2 — Tutorials + Getting Started
- `tutorials/installation.html`
- `tutorials/first-workflow.html` (the big worked example)
- `tutorials/quick-fix-workflow.html`

### Phase 3 — How-to guides
- `how-to/start-workflow.html` (with decision tree)
- `how-to/navigate-workflows.html`
- `how-to/amend-or-extend.html`
- `how-to/use-augmentations.html`
- `how-to/triage-pr-comments.html` (with sequence diagram)
- `how-to/author-ship-plan.html`
- `how-to/run-a-release.html` (with state diagram)
- `how-to/resume-paused-work.html`
- `how-to/close-workflows.html`

### Phase 4 — Reference
- `reference/pipeline.html` (with I/O graph)
- `reference/commands.html`
- `reference/skills.html`
- `reference/artifacts.html` (with file tree)
- `reference/00-index-schema.html`
- `reference/ship-plan-schema.html`
- `reference/08-handoff-schema.html`
- `reference/09-ship-run-schema.html`
- `reference/hooks.html`
- `reference/glossary.html`

### Phase 5 — Explanation
- `explanation/why-this-exists.html`
- `explanation/artifacts-over-memory.html`
- `explanation/orchestrator-discipline.html`
- `explanation/diataxis-integration.html`
- `explanation/branch-strategy.html` (with diagram)
- `explanation/adaptive-routing.html`
- `explanation/augmentations-model.html` (with diagram)
- `explanation/idempotency-in-ship.html` (with diagram)
- `explanation/the-readiness-gate.html` (with diagram)

### Phase 6 — Tips, cross-linking, polish
- `tips/escape-hatches.html` (with decision tree)
- `tips/tricks.html`
- `tips/anti-patterns.html`
- `tips/faq.html`
- Cross-link pass: every page links to 1–3 nearest siblings
- Final QA: open every page, verify mermaid renders, verify sidebar consistent
- Add a `docs/site/README.md` describing how to preview the site locally

---

## 9. Quality bar (must hold)

- **No broken links.** Run a link-checker as the last QA pass.
- **No leaked workflow context in user-facing pages.** Even the docs honor External Output Boundary — no `.ai/workflows/...` paths in marketing-style prose; cite paths only in reference pages where the path *is* the subject.
- **Every code snippet is runnable.** No prose-pseudocode in tutorials or how-to.
- **Every diagram passes a "what's this for?" test.** If a reader can't say what the diagram tells them within 10 seconds, the diagram fails.
- **Each how-to opens with pre-conditions.** "You will need: X, Y, Z. You should already have done: A."
- **Each reference page is alphabetised within its sections.** Predictability beats narrative ordering for reference.
- **Each explanation page ends with "Related" links to the relevant how-to and reference pages.** Explanation pulls; how-to pushes; reference resolves.

---

## 10. Open questions left for build time

1. **Search?** Skip for v1. Add Pagefind if the site grows past ~50 pages.
2. **Versioned docs?** Skip for v1. Git history is the version system.
3. **Mermaid rendering in `file://` context?** CDN script tag works for `https://` and most browsers' `file://`. Document the fallback in `docs/site/README.md`.
4. **Spanish/Japanese translations?** Out of scope. The plugin's prose itself is English-only.
5. **API docs for the hook scripts?** They're shell scripts; the reference page documents what each hook does. No autogenerated API.

---

## 11. Decision log

| Decision | Made on | Notes |
|---|---|---|
| Static HTML over MkDocs/Docusaurus | 2026-05-10 | No build step beats theme flexibility for a 32-page site. |
| Mermaid via CDN | 2026-05-10 | Source is in the page; CDN unreachable = readable fallback. |
| Diátaxis as the IA | 2026-05-10 | The plugin advocates Diátaxis; the docs should practice it. |
| One sidebar across all pages | 2026-05-10 | Manual copy. Regen script optional, only if maintenance becomes painful. |
| No search in v1 | 2026-05-10 | 32 pages is browsable; revisit at 50+. |
| Bundle docs with plugin | 2026-05-10 | `plugins/sdlc-workflow/docs/site/` keeps docs versioned with code. |
