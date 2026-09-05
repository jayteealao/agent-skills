# Ideation lenses (Step 1 of `intake/ideate.md`)

Step 1 of `/wf intake ideate` dispatches one exploration sub-agent per active lens. Prompt each lens agent with its goal below plus the shared evidence rule from `intake/ideate.md`: every finding cites `file:line` (or a file range) from this codebase, states the problem, states why it matters, and carries an effort estimate (xs/s/m/l/xl). Generic advice with no citation is not a finding.

**Effort tier for every dispatched lens agent:** **low** (per [_subagents.md](../../_subagents.md)). REQUIRED on every dispatch. Each lens reads code + emits structured findings against a rubric (complexity, performance, security, DX, gaps, architecture). The adversarial filtering step that comes later does the judgment work; the per-lens fan-out is bounded extraction. Low is the right tier. Dispatch in waves of at most 6.

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
- edge cases: acceptance criteria in `.ai/workflows/*/02-shape.md` with no covering test, features that break on empty or large collections
- stubs: "TODO: implement" placeholders, documented configuration with no implementation

## Lens 6 — Architecture & Design Patterns

Goal: find structural risk. Architectural fixes usually carry effort l/xl; say so. Hunt:
- structural issues: oversized modules, circular dependencies, business logic in the presentation layer
- missing abstractions: one pattern repeated 3+ times, external services wired in with no adapter layer
- over-engineering: single-implementation indirection, configuration heavier than what it configures
- coupling hotspots: files imported everywhere, large modules that export too much
