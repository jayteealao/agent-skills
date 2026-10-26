# Ideation lenses (Step 1 of `intake/ideate.md`)

Step 1 of `/wf intake ideate` dispatches one exploration sub-agent per active lens. Prompt each lens agent with its goal below plus the shared evidence rule from `intake/ideate.md`: every finding cites `file:line` (or a file range) from this codebase, states the problem, states why it matters, and carries an effort estimate (xs/s/m/l/xl). Generic advice with no citation is not a finding.

**Effort tier for every dispatched code lens agent (Lenses 1 to 6):** **low** (per [_subagents.md](../../_subagents.md)). REQUIRED on every dispatch. Each lens reads code + emits structured findings against a rubric (complexity, performance, security, DX, gaps, architecture). The adversarial filtering step that comes later does the judgment work; the per-lens fan-out is bounded extraction. Low is the right tier. Dispatch in waves of at most 6.

## Lens 1 — Code Quality & Technical Debt

Goal: find the code most likely to break or resist change. Hunt:
- complexity hotspots: long functions, deep nesting, files with both high churn and high complexity
- test-coverage gaps: source files with no test, or a test far thinner than the code it covers
- code rot: TODO/FIXME/HACK/DEPRECATED markers, dead code, duplicated logic across modules
- outdated patterns: dependencies far behind stable, deprecated API usage

## Lens 2 — Performance & Scalability

Goal: find work that fails at scale. State why each finding matters at 10× current load. Hunt:
- query patterns: N+1 lookups in loops, unpaginated collection endpoints, missing indexes
- caching gaps: repeated deterministic computation, uncached external calls, per-request refetching
- algorithmic hotspots: sorting/filtering/nested iteration over unconstrained collections
- blocking work: synchronous operations inside async-first runtimes, limits that break at scale

## Lens 3 — Security & Privacy

Goal: find exposure. Grade each finding critical / high / medium. Hunt:
- input handling: user input reaching SQL, shell, paths, or HTML unsanitized; unvalidated uploads and deserialization
- auth: unauthenticated routes, authentication-only checks where authorization is required, hardcoded credentials in tracked files
- data handling: PII or secrets in logs, insecure client-side storage, unredacted sensitive fields in responses
- dependencies: pinned versions with known high-severity CVEs

## Lens 4 — Developer Experience

Goal: find friction. Name who each friction affects. Hunt:
- setup friction: getting-started steps that fail silently, undocumented environment variables
- error quality: generic messages, swallowed errors, API errors with no code or reference ID
- API ergonomics: parameter sprawl, inconsistent naming for one operation, unguarded breaking changes
- documentation drift: undocumented exports, README features the code does not match

## Lens 5 — Feature Completeness & User-Facing Gaps

Goal: find what users hit that the happy path hides. Name the user impact of each gap. Hunt:
- state coverage: missing loading/error/empty states, forms with no validation feedback, silent failures
- accessibility: unlabeled interactive elements, missing alt text, inputs with no label, color-only signals
- edge cases: acceptance criteria in the `02-shape.md` record of each workflow (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> 02-shape.md`, per [_records.md](../../_records.md)) with no covering test, features that break on empty or large collections
- stubs: "TODO: implement" placeholders, documented configuration with no implementation

## Lens 6 — Architecture & Design Patterns

Goal: find structural risk. Architectural fixes usually carry effort l/xl; say so. Hunt:
- structural issues: oversized modules, circular dependencies, business logic in the presentation layer
- missing abstractions: one pattern repeated 3+ times, external services wired in with no adapter layer
- over-engineering: single-implementation indirection, configuration heavier than what it configures
- coupling hotspots: files imported everywhere, large modules that export too much

## The scope of a later round

A round of [_rounds.md](_rounds.md) narrows the lens prompt:

- **`deeper <idea>`.** The files of the idea's `evidence:`, and the files that import them or that they import, one step away. Each finding must be new ground: not a restatement of the idea.
- **`similar <idea>`.** The idea's problem stated as a pattern, for example "an external client call with no retry and no timeout". Search the whole repo for the pattern. For each hit, say whether it is the same problem as the idea (more evidence) or a different problem (a new finding).
- **`lens <name>` and `direction <words>`.** The whole repo, as in round 1, with the new lens or topic.

Every round agent gets the titles and evidence of the ideas already in the roster, and reports new ground only.

## Lens 7 — Source fit

Runs when the `source-items:` roster is not empty ([_sources.md](_sources.md)). Dispatch the items in waves of at most 6 agents. **Effort tier: medium** (per [_subagents.md](../../_subagents.md)): the lens matches outside facts to code, which is judgement, not extraction. For each item, the agent:

1. finds the places in the code where the item applies;
2. compares the installed version with the version that ships the item;
3. proposes one result from the results table in `_sources.md`.

A Lens 7 finding cites two anchors: the source anchor (the item id, with its line in the reference copy) and a `file:line` in the code. A finding with one anchor is not a finding. When an idea needs an upgrade first, its `depends-on:` names `/wf intake update-deps`, and the pick (step 9 of `# Pick` in [../ideate.md](../ideate.md)) prints that command before the idea's own entry.

## Research

Research has two triggers. Both run at **effort tier medium**. A claim that something was removed, changed, or broke cites a changelog line, a `study-sources` read of the installed code, or an upstream issue (the limitation rule of `intake/update-deps.md`).

**The word `research` — a broad scan.** Read the releases of the project's direct dependencies from the installed version to the latest version, and the platform guidance for the stack that Step 0 detects. With a lens filter or a topic, read only what matches: `research security` reads advisories and security fixes only. Each release that the scan reads becomes a source, and its items go through `_sources.md`.

**An agent's own research — narrow questions.** Without the word, an agent may start research only for one named question that the code cannot settle:

- **R1.** An item or a finding depends on whether the installed version ships an API, a flag, or a behaviour, and the installed code does not settle it.
- **R2.** A candidate's value depends on an outside fact: a deprecation, an advisory, or a platform rule.
- **R3.** A source points to another document that an item needs, for example a migration guide.

The rules of agent research:

1. Read the installed code first, with the `study-sources` skill. Read the web only when the installed code does not settle the question.
2. Ask one question per research act. Do not scan.
3. Write one note per act in `research/R<NN>-<label>.md`, with the frontmatter of a brainstorm research note (`intake/brainstorm/_artifact.md`) plus `trigger: agent` and `reason:` (the rule, R1, R2 or R3, and the question).
4. Do at most 8 research acts in one run. When an agent needs more, record the remaining questions as `needs-verification`, and say so in chat.
5. List every research act in the chat return, and in the `research:` roster of `01-ideate.md`.
