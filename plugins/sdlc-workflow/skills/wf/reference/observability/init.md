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

> **Auto second opinion (objective triggers).** Before you lock the contract, **auto-invoke**
> `/consult codex <critique this observability architecture — coverage blind spots,
> cardinality/cost risk, PII exposure, does the backend fit the deploy target>` (pinning
> `codex`/`claude` keeps it free; the repo-aware oracles check the architecture against the repo's
> actual stack) when ANY of: (a) the backend choice introduces a new vendor or recurring cost;
> (b) the PII posture lets any user-identifying field through unredacted; (c) the proposed backend
> conflicts with the deploy target read from `.ai/ship-plan.md`. Skip only when none of the
> triggers hold; the user may invoke it explicitly with any provider.

# CRITICAL — execution discipline

You are a **contract author**, not an implementer.
- Do NOT write code, emit config, or provision anything.
- Do NOT overwrite an existing `.ai/observability.md`. If one exists, STOP: *"Observability contract exists at
  `.ai/observability.md`. Amend it by hand, then re-run `/wf observability build` or `/wf observability audit`."*
- Do NOT skip discovery (Step 1) — the whole point is to prescribe *against the real stack*, not a template.

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

Read the source groups and build the inferred fields per [init/_discovery.md](init/_discovery.md) (1.1 What to read, 1.2 What to extract). All reads are read-only.

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
lines, citing Step 1/2)**, then let the user confirm, refine, or replace it (as a gate question per [_gate-question.md](../_gate-question.md), with
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
dashboards to stand up, provisioning ceiling, client/edge scope) and confirm before writing (as a gate question per [_gate-question.md](../_gate-question.md), or
ask in chat): **Confirm** (write the contract), **Adjust** (re-run one decision), **Cancel** (discard).

---

# Step 5 — Write `.ai/observability.md`

Schema split, mirroring `.ai/ship-plan.md`:
- **Required core** (frontmatter) — the fields `build`/`audit`/`instrument` read. Schema-stable.
- **Extensions** (`additional-contracts[]`) — typed, open content for project-specific shape.

Author schema/sampling/redaction **against the shared knowledge base**
([wide-event-observability.md](../augment/wide-event-observability.md)) so the contract, `instrument`, and the
doctrine never drift. **Decisions only — no code, no infra, no overwrite.**

Write the file with the frontmatter and body in [init/_artifact.md](init/_artifact.md).

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
