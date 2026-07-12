---
description: Reads `.ai/observability.md` and brings the repo's observability surface into compliance with it — realizing the contract across four output classes: (1) emit-layer code, as idiomatic multi-language adapters (one context-rich wide event per unit of work, with the schema, sampling, and redaction the contract specifies); (2) collection-pipeline config (OTel Collector / agent / log-shipping); (3) backend / IaC (self-hosted docker-compose, Helm/Terraform, or vendor config); (4) dashboards-as-code that query the wide-event schema. Creates missing files, adds to existing ones (no file is ever overwritten), and — only when the contract's provisioning ceiling opts in — applies remote/billable steps behind an explicit confirm gate with a print-only fallback. It never enters a vendor credential. Each gap is shown to the user before any write or remote mutation.
argument-hint: "[--dry-run]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Ground emit code in the real stack.** Before writing an adapter, sampling function, or collector config for a
> language/framework, reach for the `study-sources` skill to read the **actual installed** logging library, OTel
> SDK, or collector schema for that stack — not a recalled API. A generated adapter that matches the real
> library's signatures is the difference between working instrumentation and a plausible-but-broken one.
> Read-only; reads land in gitignored `.scratch/`.

You are running `wf observability build`. Your job: read `.ai/observability.md` as the specification, measure the
gap between what exists and what the contract requires, confirm with the user, then implement **only what is
missing** — code, pipeline, backend, and dashboards — under strict no-overwrite and remote-gating rules.

# Design contract

- **`.ai/observability.md` is the specification.** What it says is right; what is in the repo is the current
  implementation. Your job is to close the gap.
- **No overwrites.** Never replace an existing file wholesale. For existing source files, use targeted edits —
  add the emit hook, insert the schema module, wire the sampling call. The existing structure is preserved.
- **Concept-first, adapter-second — never four hardcoded TS blocks.** The contract's schema/sampling/redaction are
  language-agnostic. Realize them per unit in the unit's **own** language, detected from the contract's Block B
  and the repo. Node is the **reference adapter** (the richest examples); Go, Python, JVM, Rust, .NET each get
  their own idiomatic adapter, or — for an unrecognized stack — a commented `# TODO:` skeleton, never a crash and
  never JavaScript foisted on a non-JS unit.
- **Minimal diff.** Only add what is needed. Do not reorganize or reformat existing code.
- **Trace insertions.** When adding to an existing file, mark the inserted block with a single-line comment in
  that language's syntax: `Added by wf observability build — plan v<N>, <YYYY-MM-DD>`. Never add this to code the
  user wrote.
- **Fully runnable output.** Generated code must compile/run given the unit's existing deps; name the exact
  new deps in the compliance artifact (do not install them). Collector/IaC config must be syntactically valid.

# The four output classes

| Class | What it produces | Where it lands | Gated? |
|---|---|---|---|
| 1 — **Emit code** | Schema module, sampling fn, request-scoped event builder + emit hook, redaction, tests — per unit, per language | in-repo source (traced insertions) | No (local files) |
| 2 — **Pipeline config** | OTel Collector config, agent config, or log-shipping config | in-repo files | No (local files) |
| 3 — **Backend / IaC** | Local `docker-compose` self-hosted stack; or Helm/Terraform; or vendor setup as config + instructions | in-repo files by default | **Applying to a remote is gated** |
| 4 — **Dashboards-as-code** | Grafana/vendor dashboard JSON materializing Block-G analyses against the schema | in-repo files by default | **Publishing to a live backend is gated** |

# Safety rails (HARD rules)

- **No credentials, ever.** This command never enters a vendor API key, token, or account secret. It emits config
  + the exact commands and directs the user to authenticate. (This is the prohibited-actions boundary — entering
  credentials is always the user's own action.)
- **Remote / billable = confirm-gated + print-only fallback.** Anything that mutates a remote or provisions a
  billable resource (create a cloud log group, publish a vendor dashboard, `terraform apply`, `helm upgrade`,
  push a collector to a managed endpoint) shows the diff/plan and the exact command, requires an explicit
  per-run confirm, and **always** offers "write the commands to the compliance artifact instead." Same posture as
  `ship-plan build`'s `apply-via: gh-api` gate. Never apply silently; never without showing the payload first.
- **Respect the contract's provisioning ceiling** (`provisioning.ceiling` in Block H). `local-compose` → classes
  3–4 write local files only. `emit-iac` → write IaC files, never apply. `apply-remote-gated` → the gate above is
  available. `print-only` → classes 3–4 write commands to the compliance artifact, emit nothing to any remote.
- **No-overwrite / minimal-diff / trace-insertion** on every in-repo file.

# What this command does NOT do

- It does not author or edit `.ai/observability.md` — that is `/wf observability init`. It only *reads* the
  contract and closes the repo gap against it.
- It does not push commits, open PRs, or set secrets — it lists the deps/secrets the user must handle.
- It does not rip out existing scattered logs (see Step 6 — migration is advisory).
- It does not run a general correctness sweep — that is `/wf review`.

> **Optional second opinion.** After the gap report, you may offer `/consult <second opinion on this observability
> build plan — will these adapters actually emit queryable events; is the pipeline sound; any cardinality/cost or
> PII risk>` (or `/consult <provider> …`). Model may self-run when clearly valuable; otherwise just offer it.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--dry-run`. If present, run all audit steps and produce the full gap report but write
   nothing. Label every planned change `[DRY RUN — not written]`.
2. **Read `.ai/observability.md`.** STOP if missing: *"No observability contract found at `.ai/observability.md`.
   Run `/wf observability init` first."* Parse Blocks A–H (+ `additional-contracts[]`) into memory. Note
   `plan-version` and `provisioning.ceiling`.
3. **Read `.ai/ship-plan.md` if present** — for env → endpoint mapping and deploy target, to make IaC concrete.
4. **Index the repo's current observability surface** (a focused re-run of `init`'s Step 1, but comparing against
   the contract, not from scratch): for each unit in Block B, detect whether the schema module, sampling fn, emit
   hook, redaction, and tests already exist; whether the Block-E pipeline config exists; whether the Block-F
   backend/IaC files exist; whether the Block-G dashboards exist. Build a `unit/target → present?` index.

---

# Step 1 — Gap audit

Evaluate each contract requirement as **Compliant / Missing / Non-compliant** and record the exact delta needed.

## Audit A — Emit layer (Block B, per unit)
For each unit: is there a schema module matching Block A, a sampling fn matching Block D, a request-scoped event
builder + emit hook (one event per unit of work), and redaction matching Block C?
- **Missing:** the unit has no wide-event emit path.
- **Non-compliant:** an emit path exists but drifts from the contract's schema/sampling/redaction.

## Audit B — Pipeline (Block E)
Does the transport the contract names exist as config (collector config / agent config / log-shipping)?
- **Missing:** no pipeline config for the chosen transport.

## Audit C — Backend / IaC (Block F + provisioning ceiling)
Do the backend/IaC files the contract implies exist (compose stack / Helm / Terraform / vendor config)?
- **Missing:** the backend has no in-repo definition (subject to the ceiling).

## Audit D — Dashboards (Block G)
For each Block-G analysis: does a dashboard-as-code file exist that queries the schema for it?
- **Missing:** the analysis is specified but nothing dashboards it.

---

# Step 2 — Gap report + confirmation

Present the audit as a structured table, then confirm before writing anything:

```
Observability build — .ai/observability.md v<plan-version>
Provisioning ceiling: <ceiling>   Backend: <platform>   Units: <N>

| Audit | Requirement                              | Status        | Planned action                                  |
|-------|------------------------------------------|---------------|-------------------------------------------------|
| A     | emit layer: checkout-api (Node)          | MISSING       | Add schema+sampling+builder+emit hook + tests   |
| A     | emit layer: pricing-svc (Go)             | NON-COMPLIANT | Add business attrs to existing zerolog events   |
| B     | pipeline: otel-collector                 | MISSING       | Create otel-collector-config.yaml               |
| C     | backend: self-hosted-grafana (emit-iac)  | MISSING       | Write docker-compose + Grafana provisioning     |
| D     | dashboards: 3 analyses                    | MISSING       | Write 3 Grafana dashboard JSON files            |
```

Then confirm (AskUserQuestion, or ask in chat): **Implement all** · **Select items** (choose which gaps to close
now) · **Cancel**.

---

# Step 3 — Implement class 1: emit code (Audit A)

Skip if every unit's emit layer is Compliant. For each Missing/Non-compliant unit, detect language + framework
and emit **idiomatic** code — never a JavaScript block on a non-JS unit. Use the shared doctrine
([wide-event-observability.md](../augment/wide-event-observability.md)) for the *shape* (one event per unit,
tail sampling, redaction) and the unit's real library (verified via `study-sources`) for the *syntax*.

Per unit, generate as needed (traced insertions, no overwrite):
- **Schema module** — the Block-A field vocabulary as a type/struct/record in the unit's language.
- **Sampling function** — the Block-D always-keep classes + base rate.
- **Event builder + emit hook** — request-scoped accumulation, emitted once at completion (HTTP middleware for a
  web unit; a wrapper/decorator for a worker; a `defer`/`finally`-style emit).
- **Redaction** — the Block-C denylist wired into the logger/emit path.
- **A test** proving one event is emitted per unit of work with the required fields.

**Adapter coverage:**
- **Node** is the **reference adapter** — the richest realization (lift the patterns the old `setup-wide-logging`
  command carried: pino/winston middleware, request-scoped builder, `res.on('finish')` emit, tail sampling).
- **Go / Python / JVM / Rust / .NET** — emit the equivalent idiomatic adapter (slog/zerolog; structlog/`logging`;
  logback/slf4j; `tracing`; Serilog).
- **Unrecognized stack** — emit a commented skeleton with `# TODO:` markers naming each piece to fill in
  (ship-plan build's unknown-ecosystem precedent). Never crash, never substitute JS.

---

# Step 4 — Implement class 2: pipeline config (Audit B)

Skip if the Block-E transport is Compliant. Write the transport's config as files:
- **otel-collector** → `otel-collector-config.yaml` with receivers (OTLP), processors (batch, and a tail-sampling
  processor matching Block D if traces are in scope), and an exporter to the Block-F backend. Substitute the
  backend endpoint as an env var (`OTEL_EXPORTER_OTLP_ENDPOINT`), never a literal secret.
- **host-agent** → the agent config (Grafana Alloy / Datadog agent) as a file.
- **log-shipping** → Fluent Bit / Vector config reading stdout and forwarding to the backend.

---

# Step 5 — Implement classes 3–4: backend/IaC + dashboards (Audits C + D — gated)

**Respect `provisioning.ceiling` (Block H) at every step.**

## 5a — Backend / IaC (class 3)
- **Self-hosted OSS** → a `docker-compose.observability.yml` (or Helm/Terraform if the deploy target is k8s/cloud)
  standing up the Grafana stack (Loki + Tempo + Prometheus + Grafana) with the collector wired in. Files only
  unless the ceiling is `apply-remote-gated` **and** the user confirms an apply.
- **Vendor** → the vendor's config (e.g. a Datadog `datadog.yaml`, a Honeycomb dataset config) **as files** plus
  the exact CLI/API commands to run — **the command never contains the API key**; it references an env var the
  user sets. Directs the user to authenticate.
- **Cloud-native** → Terraform/CloudFormation for the log group / trace config as files.

## 5b — Dashboards-as-code (class 4)
For each Block-G analysis, write a dashboard definition that **queries the wide-event schema** (Block A) in the
backend's dialect:
- Grafana → dashboard JSON with panels for error-rate-by-cohort, latency-by-dependency (p95/p99 `duration_ms`),
  flag-rollout-impact — the canonical wide-event queries the doctrine's Query Examples demonstrate.
- Vendor → the vendor dashboard JSON/API payload.
Files by default. Publishing to a live backend (Grafana API, Datadog dashboard API) is **confirm-gated** with a
print-only fallback, and never carries a credential.

## The gate (classes 3–4, whenever a remote/billable step is reached)
Show the current-vs-desired diff / plan and the exact command, then:

```yaml
question: "Apply this remote/billable step now? <describe: terraform apply / helm upgrade / publish dashboard>. This provisions a real (possibly billable) resource."
header: "Provision"
options:
  - { label: "Apply now", description: "Run the command now. Requires you to have authenticated separately — this command never enters a credential." }
  - { label: "Print command only (Recommended)", description: "Write the exact command to the compliance artifact; mutate nothing." }
  - { label: "Skip", description: "Leave it unprovisioned." }
multiSelect: false
```

Record `<target>-applied: <yes | printed | skipped | failed>`. If the ceiling is below `apply-remote-gated`, the
gate is not even offered — write files/commands only.

---

# Step 6 — Migration is advisory

`build` stands up the foundation; it does **not** rip out existing scattered logs (that is a correctness risk on
code you did not write). Print a migration note and route existing-handler migration at `/wf intake refactor
<scope>` (behavior-preserving cleanup) or, for one workflow's changed files, `augment/instrument` via the
lifecycle. Do not delete or rewrite the user's existing log statements.

---

# Step 7 — Validate

For each generated file:
1. **Emit code** — does it reference symbols the unit actually has (verified via `study-sources` where a signature
   was in doubt)? Note any new dep in `deps-to-install`.
2. **YAML/JSON config** (collector, compose, dashboards) — parse it; on failure show the file + error, do not
   revert, record `config-syntax: fail`.

---

# Step 8 — Write compliance artifact

Write `.ai/observability-build.md`:

```yaml
---
schema: sdlc/v1
type: observability-build
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
plan-version-at-run: <plan.plan-version>
backend: <platform>
provisioning-ceiling: <ceiling>
files-created: [<list>]
files-patched: [<list>]
audits:
  A-emit-layer: <compliant | fixed | missing | skipped>   # per unit in the body
  B-pipeline:   <compliant | fixed | missing | skipped>
  C-backend:    <compliant | fixed | missing | skipped>
  D-dashboards: <compliant | fixed | missing | skipped>
backend-applied: <yes | printed | skipped | failed | n/a>
dashboards-published: <yes | printed | skipped | failed | n/a>
deps-to-install:
  - { unit: "<service>", name: "<package>", reason: "<emit adapter / OTel SDK>", command: "<install cmd>" }
credentials-to-set-manually:
  - { name: "<ENV_VAR>", purpose: "<backend auth — user sets this; build never enters it>", command: "<how to set>" }
validation:
  config-syntax: <pass | fail | skipped>
---

# Observability Build — <project-name>

## Files created / patched
<list with one-line descriptions>

## Emit adapters
<per unit: language, what was added, the reference-vs-idiomatic note>

## Provisioning (gated)
<for backend + dashboards: status; when printed/skipped, the exact commands + which env var carries the
credential the USER must set — never printed here as a value>

## Dev dependencies to install
<the OTel SDKs / logging libs the generated code references, per unit, with install commands>

## Re-run
After installing deps and setting credentials, re-run `/wf observability build --dry-run` to re-check, then
`/wf observability audit` for a soundness pass.
```

---

# Step 9 — Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what was realized, which units got adapters,
the top risk — e.g. an unrecognized stack that got a TODO skeleton, or a gated backend left printed), then this
receipt:
- `wrote: <created/patched files>`
- `plan-version: <v>` · `backend: <platform>` · `provisioning-ceiling: <ceiling>`
- `emit-adapters: <N units>` (`<lang breakdown; note any TODO-skeleton units>`)
- `pipeline: <transport>` · `backend-applied: <yes | printed | skipped | n/a>` · `dashboards-published: <…>`
- `deps-to-install: <count>` · `credentials-to-set-manually: <count>` (**never printed as values**)
- `warnings: <unrecognized-stack skeletons; gated steps left printed; cardinality/cost note>`
- `next-steps:`
  - Install the emit deps: `<install cmd>` per unit — the adapters are inert until installed.
  - Set backend credentials yourself: `<how>` — this command never enters them.
  - For any `*-applied`/`*-published` that is `printed`/`skipped`, run the command from `.ai/observability-build.md`.
  - `/wf observability audit` — soundness sweep across code + pipeline + dashboards.
