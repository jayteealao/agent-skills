# Review stage — command selection rules (Step 2 of `_stage.md`)

Load this file from `_stage.md` Step 2. It maps change signals to review dimensions. `_stage.md` keeps the core set, the selection constraints, and the dispatch.

Each command maps to `review/<name>.md` — **except** the two design dimensions `design-audit` and `design-critique`, which map to `design/audit.md` and `design/critique.md` respectively (see the "design work" selection rule below).

### Always include for any backend source change
(`.ts`, `.js`, `.mjs`, `.py`, `.go`, `.java`, `.cs`, `.rb`, `.php`, `.rs`, `.kt`, `.swift`, `.scala`, `.ex`, `.exs`)
- `testing` — always: new code needs test coverage assessment regardless of whether test files appear in the diff
- `maintainability` — always: new or changed functions need readability and coupling review
- `reliability` — always: error handling, retry logic, graceful degradation, fault tolerance

### Always include for any frontend source change
(`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`)
- `accessibility`
- `frontend-accessibility`
- `frontend-performance`
- `interface-craft` — static visual-detail craft (concentric radius, optical alignment, shadows-vs-borders, image outlines, tabular-nums, text-wrap, hit areas)
- `ux-copy`

### Include when the change involves design work — `review` is the design consumer that *judges it*
(any `design-*` entry in `00-index.md` `augmentations:`, a `02c-craft.md` visual contract present, or substantive UI changes when `stack.ui ≠ ∅`)
- `design-audit` — theming / responsive / anti-pattern judgment + 0–4 scoring. **Consumes the a11y / perf / web-vitals already measured in `06-verify-*.md` rather than re-running axe-core** (if no verify ran, it measures itself). Checks the `02c-craft.md` anti-goals were honored. Emits `07-design-audit.md`. Maps to `skills/wf/reference/design/audit.md`. Its absolute-ban checklist is single-sourced from `skills/wf/reference/design/_design-context.md` (Absolute bans) — load it when `stack.ui ≠ ∅` even if no `02b`/`02c` exists, so audit judges against the same canon design authored to.
- `design-critique` — register-forked prescriptive critique (brand = distinctiveness, product = earned-familiarity); preserves the stance rules + font reflex-reject. Emits `07-design-critique.md`. Maps to `skills/wf/reference/design/critique.md`.

These run as ordinary dimensions inside the parallel fan-out — reachable ad-hoc via `/wf design audit|critique`. a11y/perf are measured once (in `verify`) and *interpreted* here; never re-measured.

### Include based on what the feature does (reason from shape + slice, not just diff patterns)

**The feature adds or changes animation, transition, or gesture motion** (`transition`, `animation`, `@keyframes`, `cubic-bezier`, `transform`, Motion/Framer Motion, `useSpring`, `whileTap`, `AnimatePresence`, drag/swipe handlers):
- `motion` — easing, timing, interruptibility, origin/physicality, GPU performance, and whether the motion should exist at all

**The feature adds or modifies async, concurrent, or parallel behaviour** (async/await, goroutines, threads, Promise chains, event loops, message queues, workers, `@Async`, `CompletableFuture`, `select`, `sync.`, `atomic`, streaming, SSE, WebSocket):
- `backend-concurrency`

**The feature is a refactor, restructure, rename, or extraction** (large deletion-to-addition ratio, shape/slice describes "refactor"/"restructure"/"rename"/"extract"/"move"):
- `refactor-safety`

**The feature introduces new modules, services, packages, or architectural layers** (new directories, new top-level modules, new service files, changed import graphs, new `index.*` files, new `*Service`/`*Repository`/`*Controller` classes):
- `architecture`
- `overengineering` — if the shape describes generic/reusable abstractions or the diff introduces new base classes, generic utilities, or factory patterns

**The feature touches data reads or writes, queries, or caching**:
- `performance` — any DB query, ORM call, loop over a collection, sort/filter/aggregate, cache interaction, or algorithm over variable-size data
- `data-integrity` — any DB write, ORM mutation, transaction, schema change, or data validation

**The feature involves DB migrations** (`migrations/`, `db/migrate/`, `alembic/versions/`, `flyway/`, `*_migration.*`):
- `migrations`
- `data-integrity` (if not already selected)

**The feature handles user data, authentication, or anything privacy-sensitive** (user profiles, auth flows, personal data fields, payment processing, GDPR/CCPA scope, session management, logging in auth/payment paths):
- `privacy`

**The feature adds or changes API surface** (route definitions, OpenAPI/Swagger, REST handlers, GraphQL schemas, gRPC proto, SDK entry points, versioned paths `/v1/`, webhook handlers):
- `api-contracts`

**The feature could affect throughput, queuing, or multi-tenancy at scale** (queue consumers, background jobs, batch operations, fan-out patterns, multi-tenant data isolation, horizontal scaling assumptions):
- `scalability`

**The feature adds or changes dependencies** (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, lockfiles, new external imports):
- `supply-chain`

**The feature touches infrastructure** (Dockerfile, `docker-compose.*`, Terraform `*.tf`, Pulumi, Helm, CloudFormation, K8s YAML, Ansible):
- `infra`
- `infra-security`

**The feature modifies CI/CD pipelines** (`.github/workflows/*.yml`, `.gitlab-ci.yml`, Jenkinsfile, Makefile deploy targets):
- `ci`

**The feature involves a release, version bump, or changelog** (CHANGELOG.md, version fields, git tags, release configs):
- `release`

**The feature adds or changes logging behaviour** (log statements, logger config, structured logging setup):
- `logging`

**The feature adds or changes observability** (metrics, OpenTelemetry, Prometheus, alerting rules, health checks):
- `observability`

**The feature makes cloud/API calls that cost money** (cloud SDK calls, paid API integrations, storage operations, AI/ML inference):
- `cost`

**The feature touches documentation** (`*.md`, `*.mdx`, `*.rst`, `docs/`, docstrings):
- `docs`

**Style inconsistencies are visible in the diff** (mixed naming conventions, inconsistent patterns within the same file or module):
- `style-consistency`

**The feature changes developer-facing tooling** (scripts, Makefile, README, CONTRIBUTING, dev environment config):
- `dx`

### Output the Selection (before dispatching)

Print to chat:
```
## Review Scope
- Slug: {slug}
- Slice: {slice}
- Files changed: {N} files, +{added} -{removed} lines
- File types: {list}
- Change signals detected: {list}

## Commands Selected ({N})
1. `{command}` — {reason}
2. `{command}` — {reason}
...
```
