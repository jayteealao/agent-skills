# Observability init — the `.ai/observability.md` template (`observability/init.md` Step 5)

Load this file from `init.md` Step 5. Write the file with this frontmatter (required core, client/edge, extensions) and this body.

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
<Story section — must follow ../_story-arc.md: where the project is today (the honest gaps), the
path chosen and why, and the one decision that most shapes cost or debuggability. Not a checklist. STE
language throughout.>

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
