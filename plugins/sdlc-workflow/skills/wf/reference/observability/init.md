---
description: Author the project-level `.ai/observability.md` — a one-time, repo-scoped contract that captures the project's *entire* observability posture, language-agnostically. Works by **discovery → hypothesis → confirm**: first inventories what observability already exists in the codebase (loggers, structured vs unstructured, metrics, tracing, error-tracking, product analytics, and existing collector/dashboard/IaC config — across every language present), then reads `.ai/ship-plan.md` if present to tailor the backend to the real deploy target, then consultatively presents the gap and 2–3 real paths (backend/platform, sampling, schema, PII posture, dashboards, how far to provision) and lets the user choose. Writes a decisions contract — schema + emit + redaction + sampling + pipeline + backend + dashboards + provisioning (Blocks A–H) — never code or infra. Read by `/wf observability build`, `/wf observability audit`, and by `augment/instrument` (which designs against this schema when it exists).
argument-hint: ""
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Ground decisions in the real source.** Before asserting what logger, tracer, or telemetry SDK a service uses
> — or how it behaves — reach for the `study-sources` skill to read the **actual installed source** (the logging
> library in `node_modules`/`~/.m2`/the Go/Rust/.NET caches, the OTel SDK, the collector binary's real config
> schema). A contract grounded in the real stack beats one grounded in a recalled API. Read-only — reads land in
> gitignored `.scratch/`, never in the contract or the repo.

You are running `wf observability init`, a **one-time project-level setup utility**. The contract you author here
is consumed by every `/wf observability build` and `/wf observability audit` invocation thereafter, and by
`augment/instrument` when it designs per-change signals.

# Design intent — the reframe

This is **not** "scaffold a wide-event middleware." It is the consultative act of **understanding a project's
observability posture and moving it forward, whatever the language or stack**. Four principles govern it:

1. **Concept-first, adapter-second.** The language-agnostic core is *wide events / canonical log lines / tail
   sampling* — "emit one context-rich, queryable event per unit of work, keep the signal, sample the noise"
   ([wide-event-observability.md](../augment/wide-event-observability.md) is the shared doctrine). That idea is
   realized differently in Go, Python, JVM, Rust, a serverless function, or a Node service. JavaScript is **one
   adapter**, not the default. A run on a Go or Python service must never propose Express/Pino advice.
2. **Discover before prescribe.** Read the codebase and report what observability *already* exists before
   proposing anything.
3. **Consult, don't dictate.** Present the gap and 2–3 real paths; the user chooses. `Other (describe)` is always
   available. This is not a fill-in-the-blanks quiz.
4. **Deploy-context-aware.** If `.ai/ship-plan.md` exists, read it so the backend recommendation fits where the
   code actually ships.

This command therefore runs three loops:
1. **Discovery** — read the observability surface the repo already has. Don't ask before reading.
2. **Hypothesis** — present the current-state report + a proposed architecture, and let the user confirm,
   correct, or replace each decision.
3. **Codify** — write a contract with a small **required core** plus **open extensions**
   (`additional-contracts[]`) for project-specific shape.

# What this command produces

A single file: **`.ai/observability.md`** at the **repo root** (not under `.ai/workflows/`). The contract is
per-project, not per-workflow. Its sibling audit ledger is `.ai/observability-audit.md`.

# What this command does NOT do

- It does **not** write application code, emit config, or stand up any infrastructure — that is
  `/wf observability build`'s job, behind its own confirm gates.
- It does **not** run or modify any logger, collector, or dashboard. Discovery is read-only.
- It does **not** enter a vendor credential, API key, or account secret — ever. Choosing a backend records a
  *decision*; authenticating to it is the user's action.
- It does **not** overwrite an existing `.ai/observability.md`. If one exists, STOP and tell the user to amend by
  hand (there is no `edit` sub-key yet).
- It does **not** modify `.ai/ship-plan.md` — it only *reads* it.

> **Optional second opinion.** Before you lock the contract, you may offer
> `/consult <critique this observability architecture — coverage blind spots, cardinality/cost risk, PII
> exposure, does the backend fit the deploy target>` (or `/consult <provider> …`) — a read-only multi-model panel
> whose repo-aware oracles can check the proposed architecture against the repo's actual stack. Model may
> self-run when clearly valuable (pin `codex`/`claude`); otherwise just offer it.

# CRITICAL — execution discipline

You are a **contract author**, not an implementer.
- Do NOT write code, emit config, or provision anything.
- Do NOT overwrite an existing `.ai/observability.md`. If one exists, STOP: *"Observability contract exists at
  `.ai/observability.md`. Amend it by hand, then re-run `/wf observability build` or `/wf observability audit`."*
- Do NOT skip discovery (Step 1) — the whole point is to prescribe *against the real stack*, not a template.
- Follow the numbered steps below exactly in order.

---

# Step 0 — Orient

1. STOP if `.ai/observability.md` already exists. Tell the user to amend by hand.
2. Detect repo basics: `git remote get-url origin` (derive `<owner>/<repo>` when present), and `project-name`
   from the directory / primary manifest.
3. Note whether `.ai/ship-plan.md` exists — Step 2 reads it.

---

# Step 1 — Discovery pass: inventory the real observability surface

Read the codebase, **in parallel**, to understand what observability is *already* there. **No questions yet.**
Surface findings to the user as a *current-state report* at the end of this step. The inventory is
**language-agnostic** — detect the runtimes present, then read each one's idioms. Do not assume a single language.

## 1.1 What to read

Group A — **Languages / services / deployable units** (don't assume one):
- Manifests and their runtimes: `package.json`, `pyproject.toml`/`setup.py`, `go.mod`, `build.gradle*`/`pom.xml`,
  `Cargo.toml`, `*.csproj`, `mix.exs`, `composer.json`, `Gemfile`. Record `{ language, runtime, deployable-unit }`
  per service. Detect monorepo/workspaces (one observability posture may span many units).

Group B — **Logging** (per language — read configs *and* representative call sites):
- Node: pino / winston / bunyan / `console.*`. Python: `logging` / structlog / loguru. Go: slog / zerolog / zap /
  logrus. JVM: logback / log4j2 / slf4j. Rust: `tracing` / `log` + env_logger. .NET: Serilog / `ILogger`. Ruby:
  `Logger` / semantic_logger.
- Classify: **structured vs unstructured**, log levels in use, call-site **density** (a few canonical lines, or
  scattered diary logging?), and **where logs go** (stdout / file / a vendor transport).

Group C — **Metrics** — Prometheus client / statsd / OpenTelemetry metrics / vendor counters (Datadog, New Relic).
Note registries, exporters, and any `/metrics` endpoint.

Group D — **Tracing** — OpenTelemetry SDK, vendor tracers (Datadog `dd-trace`, Honeycomb beeline, New Relic),
trace-context propagation (W3C `traceparent`, B3). Note whether spans carry business attributes or are bare.

Group E — **Error tracking** — Sentry / Bugsnag / Rollbar / Airbrake SDK init + DSN references.

Group F — **Product analytics** — Segment / Amplitude / PostHog / Mixpanel / GA, and where events are emitted
(client, server, both).

Group G — **Existing infrastructure / config** (this is what distinguishes a foundation from scattered logs):
- OpenTelemetry Collector configs (`otel-collector-config.y*ml`), agent configs (Datadog `datadog.yaml`, Grafana
  Agent / Alloy).
- Existing dashboards: Grafana JSON (`*.json` under `dashboards/`, `grafana/`), vendor dashboard exports.
- Log shipping: Fluent Bit / Fluentd / Vector configs, Loki/Promtail.
- Observability resources in IaC: `docker-compose*.yml` services (prometheus, grafana, loki, tempo, jaeger,
  otel-collector), Helm charts, Terraform modules, k8s manifests.

Group H — **Deploy context signals** (cheap reads that inform the backend fork even before the ship-plan):
- `Dockerfile*`, k8s/Helm/kustomize presence, `serverless.yml`/`sam.yaml`, `fly.toml`/`render.yaml`/`vercel.json`,
  cloud SDK usage (AWS/GCP/Azure). Note the likely runtime environment.

**All reads are read-only.** Nothing in this step writes, runs, or installs.

## 1.2 What to extract

Build a current-state report with these inferred fields (each tagged with the source file and a confidence:
`high | medium | low`):

```yaml
inferred:
  units:                                   # one entry per deployable unit / service
    - { name: "<service>", language: "<lang>", runtime: "<runtime>", deploy-hint: "<container|serverless|server|unknown>" }

  logging:
    - unit: "<service>"
      library: "<pino|winston|slog|zerolog|logback|structlog|logging|tracing|Serilog|none>"
      structured: <true | false | mixed>
      levels-seen: [<info|warn|error|debug>]
      call-site-density: <sparse | moderate | diary>     # 'diary' = many lines per unit of work
      sink: <stdout | file | vendor | mixed | unknown>
      evidence: "<file>"

  metrics:  { present: <true|false>, tool: "<prometheus|statsd|otel|vendor|none>", evidence: "<file>" }
  tracing:  { present: <true|false>, sdk: "<otel|dd-trace|beeline|none>", propagation: "<w3c|b3|none>", business-attrs: <true|false>, evidence: "<file>" }
  error-tracking: { present: <true|false>, tool: "<sentry|bugsnag|rollbar|none>", evidence: "<file>" }
  product-analytics: { present: <true|false>, tool: "<segment|amplitude|posthog|ga|none>", where: "<client|server|both|none>", evidence: "<file>" }

  existing-infra:
    collector:   { present: <true|false>, kind: "<otel-collector|datadog-agent|grafana-alloy|none>", evidence: "<file>" }
    dashboards:  { present: <true|false>, kind: "<grafana-json|vendor-export|none>", count: <int>, evidence: "<file>" }
    log-shipping:{ present: <true|false>, kind: "<fluentbit|vector|promtail|none>", evidence: "<file>" }
    iac-observability: [<"docker-compose: grafana+loki" | "helm: kube-prometheus-stack" | ...>]

  deploy-context-hint:
    target: <container | k8s | serverless | server | static | unknown>
    cloud:  <aws | gcp | azure | none | unknown>
    evidence: "<file>"

  gaps:                                    # the honest list — where signal is absent or unqueryable
    - "<e.g. checkout service: diary logging, no structured events, no trace context>"
```

## 1.3 Present the current-state report

Show the user a compact, skimmable bullet summary (no questions yet). Make the honest gaps prominent:

```
Observability inventory:
- Units: checkout-api (Node), pricing-svc (Go), web (React SPA)
- Logging: checkout-api = winston, structured, diary density → stdout; pricing-svc = zerolog, structured, sparse → stdout; web = console.* only
- Metrics: none found        Tracing: OTel SDK in pricing-svc only, no business attributes, W3C propagation
- Error tracking: Sentry in web (client)     Product analytics: none
- Existing infra: docker-compose has prometheus + grafana (unused by app); no collector; 0 app dashboards
- Deploy context (pre-ship-plan): k8s manifests present, cloud = aws
- Honest gaps: no single queryable event per request anywhere; pricing-svc traces are bare; two logging libraries, no shared schema; grafana runs but queries nothing
```

Then ask the user (free-form, not a structured question):
> *"Does this match how the project is actually instrumented today? Anything to add, correct, or ignore before
> we discuss the path forward?"*

Apply the user's corrections to the in-memory discovery state.

---

# Step 2 — Read the ship-plan (if present)

If `.ai/ship-plan.md` exists, read it and parse the **deploy target, environments, cloud, and CI**
(`ship-environments[]`, `ship-meaning`, any infra/IaC evidence). Use it to make the backend/pipeline options in
Step 3 **specific**, not generic:

| Ship-plan says | Bias the backend/pipeline options toward |
|---|---|
| k8s / container | OTel Collector as a DaemonSet/sidecar → self-hosted Grafana stack (Loki/Tempo/Prometheus/Grafana) or a vendor agent |
| serverless (AWS) | CloudWatch + ADOT (AWS Distro for OpenTelemetry) lambda layer, or a vendor forwarder |
| serverless (GCP/Azure) | Cloud Logging + Cloud Trace / Azure Monitor + OpenTelemetry exporter |
| plain server / VM | a host agent (Grafana Alloy / vendor agent) or direct SDK export to a self-hosted or vendor backend |
| a vendor already in the tree | extend it rather than introduce a second backend |

If **no ship-plan exists**, note it and offer `/wf ship-plan init` as a companion (do **not** require it — the
deploy-context hint from Step 1 still lets you present sensible options).

---

# Step 3 — Consult: present the path forward and the options

Now run the hypothesis→confirm loop. For each decision below, **state the inferred/recommended value + why (1–2
lines, citing Step 1/2)**, then let the user confirm, refine, or replace it (AskUserQuestion where available, with
`Other (describe)` always present; otherwise ask in chat and WAIT). These are **real forks with tradeoffs**, not a
quiz. Bias every option by the discovered stack and the ship-plan — never propose a JS default on a non-JS repo.

## Decision A — Wide-event schema (language-agnostic)
The canonical field vocabulary every unit will emit: correlation (`request_id`/`trace_id`), service identity
(`service`, `version`, `env`), request/unit outcome (`operation`, `duration_ms`, `outcome`, `status`), actor
(`user.id`, tier), error (`error.type`, `error.code`), plus **domain** fields the project cares about. Normalize
keys (one `user.id`, not `userId`/`user_id`/`uid`). Author this against the shared doctrine so `instrument` and
this contract never drift.

## Decision B — Sampling
Tail-sampling policy: the **always-keep** classes (errors, slow, VIP/important cohorts, feature-flagged traffic) +
a base rate for the noise + the cost posture. Present the doctrine's default (keep 100% of signal, sample ~5% of
the rest) and let the user tune to their volume.

## Decision C — PII / redaction
The security contract: the denylist (secrets, tokens, PANs, SSNs), hash-vs-drop for identifiers, sensitive-field
handling. This becomes Block C and is enforced by `audit`'s `pii-and-redaction` lens.

## Decision D — Backend / platform (the consultative fork)
Present **2–3 real paths**, biased by the ship-plan's cloud and any vendor already in the tree, trading
cost / ops-burden / lock-in plainly:
- **Self-hosted OSS** — Grafana stack (Loki logs + Tempo traces + Prometheus metrics + Grafana dashboards) driven
  by an OTel Collector. Low cost, high ops burden, no lock-in.
- **Vendor** — Datadog / Honeycomb / New Relic / Grafana Cloud / Sentry (for errors). Low ops burden, per-volume
  cost, lock-in. Honeycomb/Datadog suit wide-event querying well.
- **Cloud-native** — CloudWatch (Logs Insights) / GCP Cloud Logging + Trace / Azure Monitor. Integrated with the
  cloud you already deploy to; querying and cardinality vary by provider.

## Decision E — Collection pipeline
How events travel from the process to the backend: **direct SDK export** (simplest), **OTel Collector** (a
vendor-neutral hop — recommended when multiple units or a possible backend switch), a **host/agent** forwarder, or
**log-shipping** (stdout → Fluent Bit/Vector → backend). Bias by unit count and the deploy target.

## Decision F — Dashboards
Which analyses matter — the canonical wide-event queries materialized as dashboards: **error-rate by cohort**,
**latency by dependency/region**, **feature-flag rollout impact**, plus any domain analysis (e.g. checkout funnel).
Record the **dashboard-as-code target** (Grafana JSON / vendor dashboard API / Terraform).

## Decision G — Provisioning approach (the ceiling `build` must not exceed)
How far `/wf observability build` should go, recorded so `build` never over-reaches:
- **local compose only** — a `docker-compose` self-hosted stack for local/dev.
- **emit IaC files** — Helm/Terraform/collector config written to the repo; the user applies them. *(Recommended
  default.)*
- **apply to remote behind a gate** — `build` may `terraform apply` / `helm upgrade` / publish a dashboard, but
  only with an explicit per-run confirm and a print-only fallback. Never silent, never with stored credentials.
- **print-only** — `build` emits nothing to any remote; it writes the exact commands to the compliance artifact.

## Decision H — Client / edge scope (optional)
Whether the contract covers a browser/edge tier (client wide events, error boundary, `sendBeacon` transport) or
server units only. Default: server units first; client/edge is an opt-in extension.

Optionally offer the `/consult` panel (above) before locking.

---

# Step 4 — Confirmation

Present a summary of the confirmed decisions (schema field count, sampling posture, chosen backend, pipeline,
dashboards to stand up, provisioning ceiling, client/edge scope) and confirm before writing (AskUserQuestion, or
ask in chat): **Confirm** (write the contract), **Adjust** (re-run one decision), **Cancel** (discard).

---

# Step 5 — Write `.ai/observability.md`

Schema split, mirroring `.ai/ship-plan.md`:
- **Required core** (frontmatter) — the fields `build`/`audit`/`instrument` read. Schema-stable.
- **Extensions** (`additional-contracts[]`) — typed, open content for project-specific shape.

Author schema/sampling/redaction **against the shared knowledge base**
([wide-event-observability.md](../augment/wide-event-observability.md)) so the contract, `instrument`, and the
doctrine never drift. **Decisions only — no code, no infra, no overwrite.**

```yaml
---
schema: sdlc/v1
type: observability-plan
slug: <project-name-as-slug>
plan-version: 1
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
project-name: "<repo or product name>"
ship-plan-read: <true | false>            # whether .ai/ship-plan.md informed the backend choice

# === Required core ===

# Block A — Wide-event schema (language-agnostic canonical field vocabulary)
schema-core:
  correlation: [request_id, trace_id, span_id]
  service:     [service, version, env]
  outcome:     [operation, duration_ms, outcome, status]
  actor:       [user.id, user.tier]
  error:       [error.type, error.code, error.retriable]
schema-domain:                            # project-specific fields
  - { key: "<cart.total_cents>", type: "<int>", unit: "<service>" }
key-normalization: "<one canonical key per concept — e.g. user.id, never userId/user_id>"

# Block B — Emit layer (per unit / language)
emit:
  - unit: "<service>"
    language: "<lang>"
    mechanism: "<one context-rich event per unit of work, built request-scoped, emitted once at completion>"
    builder-location: "<where the event builder lives — planned path>"

# Block C — Redaction / PII
redaction:
  deny: [password, token, api_key, authorization, cookie, ssn, card_number]
  hash: [<email, ...>]                    # hash-not-log identifiers
  policy: "<drop | hash | last-4 — per field class>"

# Block D — Sampling
sampling:
  always-keep: [errors, slow-requests, vip-cohorts, feature-flagged]
  slow-threshold-ms: <int>
  base-rate: <0.0–1.0>                    # sample of the remaining noise
  cost-posture: "<one line on volume/cost intent>"

# Block E — Collection pipeline
pipeline:
  transport: <direct-sdk-export | otel-collector | host-agent | log-shipping>
  collector-config-target: "<planned path, or none>"
  notes: "<how events leave the process>"

# Block F — Backend + query layer
backend:
  platform: <self-hosted-grafana | datadog | honeycomb | new-relic | grafana-cloud | cloudwatch | gcp-cloud-logging | azure-monitor | <freeform>>
  storage: "<logs/traces/metrics stores>"
  query-dialect: "<LogQL | Datadog | Honeycomb | CloudWatch Insights | ...>"
  retention: "<e.g. 14d hot>"
  lock-in-note: "<cost/ops/lock-in tradeoff recorded>"

# Block G — Dashboards
dashboards:
  target: <grafana-json | vendor-api | terraform | none>
  analyses:
    - { id: error-rate-by-cohort, query-intent: "error rate grouped by user.tier + feature flag" }
    - { id: latency-by-dependency, query-intent: "p95/p99 duration_ms by downstream + region" }
    - { id: flag-rollout-impact, query-intent: "error-rate + latency, flag on vs off" }

# Block H — Provisioning + environments
provisioning:
  ceiling: <local-compose | emit-iac | apply-remote-gated | print-only>   # build must not exceed this
  never-store-credentials: true          # invariant — build never enters a vendor secret
  environments:                          # from ship-plan when present
    - { name: "<env>", backend-endpoint-env-var: "<OTEL_EXPORTER_OTLP_ENDPOINT | ...>" }

# Client/edge (optional)
client-edge:
  in-scope: <true | false>
  notes: "<browser/edge wide-event scope, if in scope>"

# === Extensions — open schema ===
additional-contracts:
  - id: <short-id>
    purpose: "<one sentence>"
    fields: { <key>: <value> }
    enforced-by: "<audit lens | human role>"
---

# Observability Plan — <project-name>

## The Observability Posture
<Narrative — the story section, per ../_narrative-voice.md. Lead with where the project is today (the honest
gaps), the path chosen and why, and the one decision that most shapes cost or debuggability. Voice: relevance
first, why before how, tradeoffs plain. Not a checklist.>

## Wide-event schema
<the canonical field vocabulary + domain fields + key-normalization rule, language-agnostic.>

## Emit layer
<per unit/language: the one-event-per-unit mechanism and where the builder lives. Note JS is one adapter.>

## Redaction & PII
<the denylist, hash-vs-drop policy, sensitive-field handling.>

## Sampling
<the tail-sampling rules, thresholds, base rate, cost posture.>

## Collection pipeline
<how events travel from process to backend; collector/agent/transport.>

## Backend & query layer
<the chosen platform + why it fits the deploy target; storage, query dialect, retention, lock-in tradeoff.>

## Dashboards
<the analyses to stand up and the dashboard-as-code target.>

## Provisioning & environments
<the ceiling build must respect; the credential invariant; env → endpoint mapping (from ship-plan).>

## Additional contracts
<one subsection per additional-contracts[] entry.>
```

---

# Step 6 — Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead (the posture today, the path chosen, the top
risk — e.g. cardinality/cost or a stack with no adapter yet), then this receipt:
- `wrote: .ai/observability.md`
- `plan-version: 1`
- `units: <N>` (`<lang breakdown>`)
- `backend: <platform>` · `pipeline: <transport>` · `provisioning-ceiling: <ceiling>`
- `ship-plan-read: <true | false>`
- `dashboards-planned: <N>`
- `next-steps:`
  - `/wf observability build` — realize the contract: emit-layer adapters for each unit, pipeline config, backend
    IaC, and dashboards-as-code (files by default; every remote/billable step confirm-gated).
  - `/wf observability audit` — read-only soundness sweep once the surface is built.
  - (if no ship-plan) `/wf ship-plan init` — author the release contract so the backend choice can be tied to the
    real deploy target.
