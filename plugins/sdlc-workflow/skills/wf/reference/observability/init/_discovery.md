# Observability init — discovery pass (`observability/init.md` Step 1)

Load this file from `init.md` Step 1. Read every source group in 1.1, then build the current-state report fields in 1.2.

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
