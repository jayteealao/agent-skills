# `/wf observability` — project-level observability router (Implementation Plan)

> Status: **BUILT — waves W1–W5 shipped in full as v9.132.0.** (Drafted 2026-07-12;
> revised 2026-07-12 after scope feedback. The "PROPOSED" this header carried until
> 2026-07-27 was stale for fifteen releases — see the v9.132.0 CHANGELOG entry,
> "Full build of `docs/internal/OBSERVABILITY-ROUTER-PLAN.md` (waves W1–W5) in one
> release".)
> Provenance: a review of the orphaned `setup-wide-logging` surface. It exists **four times** across the
> two trees, is Node/TS-only, and sits *outside* the `/wf` dispatcher — the standalone command is even
> `disable-model-invocation: true`, so the model can't reach it. Meanwhile the *knowledge* it embodies was
> already folded into `/wf` (as `augment/wide-event-observability.md`), but the *entry point* never was.
> **Revision:** the first draft inherited the source material's JS/framework-centrism and scoped `build` to
> in-repo code only. Per feedback, the router is reframed as a **language-agnostic, codebase-aware,
> consultative observability architect** that inventories what exists, aligns to the ship-plan, discusses the
> path forward, and can stand up the whole analysis surface — pipeline, backend, and **dashboards** — behind
> safety gates. Baseline: v9.124.0 (`d2c688b`). Codex mirror: `plugins/sdlc-workflow-codex/`.

## The house-rule decision (read this first)

The intent-fidelity plan, drafted the same day, states an inherited house rule:
[*"no new skills, no new top-level `/wf` keys. The surface stays at 20 keys."*](INTENT-FIDELITY-HARDENING-PLAN.md:11)
**This plan adds a 21st key** (`observability`; Codex 19→20). That is a deliberate exception, and it should be
ratified consciously before any code lands. The case for it:

- The rule was **context-scoped** to intent-fidelity, where every capability *could* land inside an existing
  key. Here it genuinely cannot: project-level observability setup is neither a lifecycle stage (it writes no
  `NN-*.md` slug artifact) nor a mode of one.
- The honest home is a **router**, and routers are already the sanctioned non-stage exception — `ship-plan`
  and `docs` are exactly this: project-level contracts + build + audit, invoked as `/wf <router> <subkey>`.
- Alternatives rejected: `ship-plan observability` (ship-plan is *release*, orthogonal); an `intake` mode
  (starts a slug lifecycle — this is project-level); folding into `augment/instrument` (per-change, writes a
  *plan* not project infra).

**If the exception is declined**, the fallback is a reduced surface (init + audit, no build/infra) — but that
abandons the actual capability. The plan assumes the exception is granted (consistent with the chosen name).

## What this router is (the reframe)

Not "scaffold a wide-event middleware." It is the command that **understands a project's observability
posture and moves it forward, consultatively, whatever the language or stack**:

1. **Concept-first, adapter-second.** The language-agnostic core is *wide events / canonical log lines / tail
   sampling* — "emit one context-rich, queryable event per unit of work, keep the signal, sample the noise."
   That idea is realized differently in Go, Python, JVM, Rust, a serverless function, or a Node service. JS is
   **one adapter**, demoted from "the default" to "the reference implementation."
2. **Discover before prescribe.** It reads the actual codebase and reports what observability *already* exists
   — loggers, structured vs unstructured, metrics, tracing, error-tracking, product analytics, and where those
   signals currently go — before proposing anything.
3. **Consult, don't dictate.** It presents the gap and 2–3 real paths (backend/platform, sampling, schema, PII
   posture, cost), and the user chooses — `ship-plan init`'s discovery→hypothesis→confirm loop, plus an
   optional `/consult` panel on the proposed architecture.
4. **Deploy-context-aware.** If `.ai/ship-plan.md` exists, it reads it — environments, deploy target
   (container/k8s/serverless/server), cloud, CI — so the infra recommendation fits where the code actually
   ships instead of being generic.
5. **The whole surface, gated.** It can go beyond emit code to the **collection pipeline**, the **backend**,
   and **usable dashboards** — but any remote or billable provisioning is confirm-gated with a print-only /
   IaC-file fallback, and it **never enters vendor credentials** (that's the user's action).

### The gap this fills

| Scope | Served by | What it does |
|---|---|---|
| **Per-change instrumentation** | [`augment/instrument.md`](../skills/wf/reference/augment/instrument.md) | Shape-decided; scans one workflow's changed files for dark paths; writes an instrumentation **plan**, never code or infra; assumes the foundation exists. |
| **Project observability foundation + analysis surface** | *nothing* | Schema, emit layer, redaction, sampling, **collection pipeline, backend, dashboards** — the infrastructure per-change instrumentation plugs into. |

`instrument` is the tenant; there is no landlord. `/wf observability` becomes the landlord.

### Current surfaces (all verified) — and the JS-centrism to design against

1. [`commands/setup-wide-logging.md`](../commands/setup-wide-logging.md) — standalone, `disable-model-invocation: true`, **Node/TS-only** (express/koa/fastify/nextjs × pino/winston/bunyan). **To dissolve.**
2. [`skills/setup-wide-logging/SKILL.md`](../../../sdlc-workflow-codex/skills/setup-wide-logging/SKILL.md) (Codex) — model-invocable mirror of #1. **To dissolve.**
3. [`augment/wide-event-observability.md`](../skills/wf/reference/augment/wide-event-observability.md) — the folded-in doctrine; Express + React examples. **Keep as shared knowledge base — but de-center JS (see W5.4).**
4. [`augment/instrument.md`](../skills/wf/reference/augment/instrument.md) — the per-change augmentation. **Keep; wire the boundary.**
5. `review/logging.md` + `review/observability.md` — review dimensions. **Untouched.**

**Explicit risk to engineer against:** every existing surface teaches in JavaScript. The router must present
the *concept* language-neutrally and reach for a stack adapter only after discovery reveals the stack. A
success test is: running it on a Go or Python service must never emit Express/Pino advice.

---

## W1 — The `observability` router key (surface + dispatch)

**Thesis.** Add the key to the single dispatcher; give it a thin router reference mirroring
[`ship-plan.md`](../skills/wf/reference/ship-plan.md) — resolve the subkey, load the sub-reference, return its
chat contract as-is.

### W1.1 — `wf/SKILL.md` edits (both trees)
- **Dispatch table** (SKILL.md:49-57): add an `observability` row to the *routers* group:
  `observability | <init|build|audit> [args] | Project observability router. init inventories the codebase's current logging/telemetry/analytics, reads the ship-plan, and consultatively authors .ai/observability.md (schema + sampling + redaction + backend + pipeline + dashboards, language-agnostic); build realizes it (emit-layer adapters, collector/pipeline config, backend IaC, dashboards-as-code — gated); audit runs a read-only soundness sweep into .ai/observability-audit.md.`
- **Counts** (SKILL.md:12, :20, :64, :65): 20 → **21** keys (Codex 19 → **20**, no `yolo`); update known-keys list + error roster.
- **`argument-hint`** (SKILL.md:5): append `|observability`.
- **Step 0.5 exclusion** (SKILL.md:79-87): add `observability` to the **routers** bullet — first token is a
  sub-key resolved inside the router, not a slug; must not trip fuzzy-slug.
- **Router-chain note** (SKILL.md:120): add `observability` to the router list.

### W1.2 — new `reference/observability.md` router (both trees)
Structural clone of `ship-plan.md`: `argument-hint: "<init|build|audit> [args...]"`; EOB header; Step 0 resolves
first token → `reference/observability/<subkey>.md`; Step 1 loads + follows verbatim; Step 2 returns the
sub-reference's chat contract. Usage block lists the three subkeys.

**Tests.** Drift guard: 21-key roster (both trees) + Step 0.5 router-exclusion include `observability`;
router-resolution test (unknown subkey → usage). Re-establish parity count.

---

## W2 — `observability init` — inventory, consult, author `.ai/observability.md`

**Thesis.** The consultative core. A decisions contract, not code. Extends `ship-plan/init.md`'s
discovery→hypothesis→confirm with a **deep observability inventory** and a **ship-plan read**. STOP-on-exists.

### W2.1 — Discovery: inventory the real observability surface (language-agnostic)
Read the codebase — parallel, **read before asking** — and produce a *current-state report* covering:
- **Languages/services present** (don't assume one) — the set of runtimes and deployable units.
- **Logging** — loggers per language (pino/winston/zap/zerolog/slog/logback/structlog/`logging`/tracing crates…),
  structured vs unstructured, log levels, call-site density, where logs go (stdout/file/vendor).
- **Metrics** — Prometheus/statsd/OTel metrics/vendor counters, if any.
- **Tracing** — OTel SDK, vendor tracers (Datadog, Honeycomb, New Relic), trace-context propagation.
- **Error tracking** — Sentry/Bugsnag/Rollbar.
- **Product analytics** — Segment/Amplitude/PostHog/GA and where events are emitted.
- **Existing infra/config** — OTel Collector configs, agent configs, existing dashboards (Grafana JSON,
  vendor dashboard exports), log-shipping, `docker-compose`/Helm/Terraform observability resources.
Output: `instrumentation_inventory` per unit + a "current surface" summary + the honest gaps.

### W2.2 — Read the ship-plan (if present)
If `.ai/ship-plan.md` exists, parse deploy target, environments, cloud, and CI. Use it to make the backend/infra
options **specific** (k8s → collector DaemonSet + Grafana/Loki/Tempo/Prometheus; serverless/AWS →
CloudWatch/ADOT; plain server → agent or self-hosted compose; vendor already in the tree → extend it). If no
ship-plan, note it and offer `/wf ship-plan init` as a companion (don't require it).

### W2.3 — Consult: present the path forward and options
After the report, run the hypothesis→confirm loop (AskUserQuestion, `Other` always available) over the real
decisions:
- **Schema** — the language-agnostic wide-event field vocabulary (correlation/service/request/user/error +
  domain), normalized keys.
- **Sampling** — tail-sampling policy: always-keep classes + base rate + cost posture.
- **PII/redaction** — the security contract.
- **Backend/platform** — the consultative fork: **self-hosted OSS** (Grafana stack / OTel Collector) ·
  **vendor** (Datadog / Honeycomb / Sentry / New Relic) · **cloud-native** (CloudWatch / GCP Cloud Logging /
  Azure Monitor). Trade cost/ops/lock-in plainly; bias by the ship-plan's cloud.
- **Pipeline** — how events travel (direct SDK export / OTel Collector / agent / log-shipping).
- **Dashboards** — which analyses matter (the canonical wide-event queries: error-rate by cohort, latency by
  dependency/region, feature-flag rollout impact) and the dashboard-as-code target.
- **Provisioning approach** — how far `build` should go (local compose only / emit IaC files / apply to remote
  behind a gate / print-only). Records the user's ceiling.
Optionally offer `/consult <critique this observability architecture — gaps, cardinality/cost risk, PII, does
the backend fit the deploy target>` before locking.

### W2.4 — the contract (`.ai/observability.md`, repo root)
Recommended filename `.ai/observability.md` (audit → `.ai/observability-audit.md`). Blocks (small required core
+ open extensions, ship-plan-style), now spanning code **and** infra:

| Block | Captures |
|---|---|
| A — Wide-event schema | Language-agnostic canonical field vocabulary + domain extensions. |
| B — Emit layer (per unit) | The one-event-per-unit mechanism for each service/language; where the builder lives. |
| C — Redaction / PII | Denylist, hash-vs-drop, sensitive-field handling. |
| D — Sampling | Tail-sampling rules + base rate + cost posture. |
| E — Collection pipeline | Collector/agent/transport; how events leave the process. |
| F — Backend + query layer | The chosen platform, storage, query dialect, retention. |
| G — Dashboards | The analyses to stand up + dashboard-as-code target. |
| H — Provisioning + environments | local/IaC/remote-gated/print-only; env mapping (from ship-plan). |
| Client/edge (optional) | Browser/edge tier scope. |
| `additional-contracts[]` | Project-specific open extension. |

Decisions only — **no code, no infra, no overwrite.** Author schema/sampling/redaction against the shared
knowledge base so `instrument` and this contract never drift.

**Tests.** Section-presence drift guard; a fixture run producing a parseable `.ai/observability.md`; a
non-JS-fixture assertion that discovery reports the right stack and proposes no Express/Pino default.

---

## W3 — `observability build` — realize the contract (code + pipeline + backend + dashboards, gated)

**Thesis.** Read `.ai/observability.md` as the spec, detect what exists, measure the gap, confirm, then build
**only what's missing** under no-overwrite / minimal-diff / trace-insertion rules — extended from
[`ship-plan/build.md`](../skills/wf/reference/ship-plan/build.md), including its **remote-mutation gating**.

### W3.1 — Four output classes (mirrors ship-plan build's file/remote split, widened)
1. **Emit code (in-repo, multi-language adapters).** The de-JS-ification: detect language + framework per unit
   and emit idiomatic code (schema module, sampling fn, emit hook, tests). **Node is the reference adapter**
   (lift the old command's blocks here); Go/Python/JVM/Rust get their own adapter or a `# TODO:`-marked
   skeleton (ship-plan build's unknown-ecosystem precedent). Never four hardcoded TS blocks.
2. **Collection pipeline config (in-repo).** OTel Collector config, agent config, log-shipping — as files.
3. **Backend / IaC (gated).** Local `docker-compose` for a self-hosted stack; or Helm/Terraform for a real
   deploy; or vendor setup **as config + instructions**. Files by default; applying to a remote is confirm-gated.
4. **Dashboards-as-code (gated).** Materialize Block-G analyses as Grafana/Datadog/etc. dashboard JSON that
   query the wide-event schema. Files by default; publishing to a live backend is confirm-gated.

### W3.2 — Safety rails (hard rules)
- **No credentials, ever.** The command never enters a vendor API key, token, or account secret. It emits
  config + the exact commands and directs the user to authenticate. (Matches the prohibited-actions boundary.)
- **Remote/billable = confirm-gated + print-only fallback.** Anything that mutates a remote or provisions a
  billable resource (create a cloud log group, publish a vendor dashboard, `terraform apply`, `helm upgrade`)
  shows the diff/plan, requires an explicit confirm, and always offers "write the commands to the compliance
  artifact instead." Same posture as `ship-plan build`'s `apply-via: gh-api` gate.
- **No-overwrite / minimal-diff / trace-insertion** on every in-repo file (`# Added by wf observability build`).

### W3.3 — migration is advisory
`build` stands up the foundation; it does not rip out existing scattered logs (correctness risk). It prints a
migration note and points existing-handler migration at `/wf intake refactor <scope>` or `augment/instrument`.

**Tests.** Multi-adapter golden files (Node + at least one non-JS); no-overwrite guard; unknown-ecosystem emits
a skeleton not a crash; remote-provisioning step is gated + has a print-only path (asserted, never live in tests).

---

## W4 — `observability audit` — read-only soundness sweep

**Thesis.** Lowest-risk subkey (writes only a ledger). Copy [`ship-plan/audit.md`](../skills/wf/reference/ship-plan/audit.md):
parallel lens fan-out, refute-before-report, second refutation on load-bearing findings, accumulating ledger
`.ai/observability-audit.md`, route each finding to its fixer, interactive triage of BLOCKER/HIGH.

### W4.1 — the lenses (code **and** infra)
| Lens | The question |
|---|---|
| `dark-path-coverage` | Which codebase paths / critical functions emit no queryable signal? (Codebase-wide, vs `instrument`'s per-slice scope.) |
| `schema-consistency` | Do emitted events match the Block-A schema, or have keys drifted across call sites/languages? |
| `pii-and-redaction` | Fields logged that Block-C should redact; secrets reachable in an event; prod stack traces. |
| `sampling-soundness` | Does Block-D keep the signal and sample the noise? Cost blow-ups or blind spots. |
| `one-event-discipline` | Diary-logging: N log lines per unit instead of one enriched wide event. |
| `pipeline-and-backend` | Is the Block-E/F pipeline config sound — collector wired to every unit, transport reaching the backend, retention set? Config-level, not a live health check. |
| `dashboard-coverage` | Are the Block-G analyses actually dashboarded, or is the schema collecting fields nothing queries? |

### W4.2 — ledger + routing
`.ai/observability-audit.md` accumulates (never overwrites); same frontmatter/`findings[]`/`runs[]` shape as
ship-plan-audit; verdict `sound | ship-with-caveats | unsound`. Routes: contract/policy defect → amend
`.ai/observability.md` block X (a future `edit` subkey; hand-edit for v1); missing scaffold →
`/wf observability build`; a code-level leak/desync → `/wf intake fix <scope>`; deep correctness beyond the
observability surface → `/wf review sweep pre-merge` (pointer).

**Tests.** Ledger accumulation round-trip (open→resolved); refute-before-report phrase guard; verdict-derivation
unit.

---

## W5 — Dissolve the orphans + wire the boundary + de-center JS

**Thesis.** Fold-in means *dissolve the standalone*, keep one shared knowledge base, add a redirect — the
pattern `/wf-quick`, `craft`, and `wide-event-observability` itself followed.

### W5.1 — retire (rides the release that ships `build` — see sequencing)
- Delete [`commands/setup-wide-logging.md`](../commands/setup-wide-logging.md) and Codex `skills/setup-wide-logging/`.
- Remove from both manifests / marketplace.
- SKILL.md Step 0 resolution rule 3: redirect — *"`setup-wide-logging` is now `/wf observability build` (with
  `init` to inventory + author the contract first, and `audit` to review it)."*

### W5.2 — single knowledge base
Keep `augment/wide-event-observability.md` as the **one** source of wide-event/sampling/redaction doctrine; both
`observability init`/`build` and `augment/instrument` reference it. No re-derivation.

### W5.3 — the explicit boundary (both directions)
- In `reference/observability.md`: *"This router sets up and audits the **project-wide** observability
  foundation + analysis surface. To add signals for **one change**, see shape-decided `augment/instrument`."*
- In `augment/instrument.md`: *"This designs signals for one change **against the project's existing
  foundation**. To establish or audit that foundation, use `/wf observability`."* Plus: **when
  `.ai/observability.md` exists, `instrument` designs against its Block-A schema** and its Block-E pipeline.

### W5.4 — de-center JS in the doctrine (new, from feedback)
`wide-event-observability.md` currently teaches only Express + React. Add a short **language-agnostic core**
section up front (the concept + a stack-neutral field table + "adapters realize this per language") and reframe
the JS/React sections as *one illustrative adapter*. Do not delete the JS content — demote it. This keeps the
shared library from re-injecting JS-centrism into the new router.

**Tests.** Grep guard: no live `setup-wide-logging` invocation post-dissolve (only the redirect); boundary
sentences present in both files; doctrine file has a language-agnostic core section ahead of any framework code.

---

## Sequencing & releases

The dissolve (W5.1) cannot precede `build` (W3.1). Infra + dashboards (W3.1 classes 3–4) are the heaviest,
riskiest, most tool-specific work (remote/billable, per-backend). So split by risk:

| Release | Contents | Rationale |
|---|---|---|
| **R1 `v9.125.0`** | W1 (key) + W2 (init: inventory + ship-plan read + consult + contract) + W4 (audit) | Everything that **reads, inventories, decides** — no code-gen, no infra, all safe. Old `setup-wide-logging` **kept** (still provides JS scaffolding in the interim). Lands the consultative core first. |
| **R2 `v9.126.0`** | W3.1 classes 1–2 (emit adapters + pipeline config) + W5 (dissolve + de-JS doctrine) | The code realization replaces `setup-wide-logging`; dissolve rides here so there's **no capability gap**. |
| **R3 `v9.127.0`** | W3.1 classes 3–4 (backend IaC + dashboards-as-code) + the gating rails | The billable/remote surface, per-backend. Can iterate one platform at a time without blocking the core. |

Per-release mechanics (memory rules): both trees + `npm run sync:codex`; version bump = 5 source/config spots +
53 doc-site brand seds + mk top-level; doc-site key-roster 20→21 audit (`.html` + `_build_pages.py` together,
never `_build_pages.py` alone). **No `dist/` rebuild** — pure references + a command deletion + manifests, no
`lib/`/`hooks/` touch, so no buildId change and no render version-gate bump. Re-establish parity; tests green +
new drift guards.

## Acceptance criteria (plan-level)

1. `/wf observability` with no subkey renders usage; a bad subkey errors with usage.
2. `init` on a **non-JS** repo (Go or Python) reports the real logging/telemetry/analytics surface and proposes
   **no** Express/Pino default; on any repo it reads `.ai/ship-plan.md` when present and tailors backend options
   to the deploy target.
3. `init` presents backend/platform/dashboard/provisioning **options** (not a fixed prescription) and writes a
   parseable `.ai/observability.md` with blocks A–H; re-running STOPs on exists.
4. `build` emits idiomatic emit code for the detected stack as **traced insertions** (no overwrite); an
   unrecognized ecosystem yields a TODO skeleton; **no vendor credential is ever entered**; every remote/billable
   step is confirm-gated with a print-only fallback.
5. `build` can produce dashboards-as-code that query the Block-A schema (materializing the canonical analyses).
6. `audit` writes `.ai/observability-audit.md`, accumulates across runs, covers code **and** pipeline/dashboard
   lenses, and routes findings; writes nothing else.
7. `setup-wide-logging` is gone from both trees + manifests; the redirect fires; `wide-event-observability.md`
   remains sole doctrine and now leads with a language-agnostic core; `instrument` states the boundary and
   designs against `.ai/observability.md` when present.
8. 21-key roster consistent across SKILL.md (both trees), Step 0.5, error roster, doc-site; parity re-established;
   tests green.

## Open questions

- **Backend/platform matrix breadth** — how many platforms does `build` support as first-class dashboard/IaC
  targets in R3 (Grafana stack + one vendor + one cloud-native?) vs "emit generic OTel + instructions"? Start
  narrow; expand per demand.
- **How far does `build` provision by default** — the ceiling recorded in Block H. Recommend default =
  **files/IaC only**, remote apply strictly opt-in per-run. Confirm.
- **Contract filename** — `.ai/observability.md` (rec) vs `.ai/observability-plan.md` (parallels `ship-plan.md`).
- **`edit` subkey** — deferred (hand-edit `.ai/observability.md` in v1); add if `audit` routing shows friction.
- **Client/edge scope** — opt-in via the contract; confirm R2 ships server adapters first, browser/edge as an
  extension.
- **The house-rule exception** — ratify the 21st key (top section) before R1.
