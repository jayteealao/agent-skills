# IDEAS-2: Full-Org SDLC Commands

20 high-impact commands covering all roles in a software development company — product, design, QA, security, SRE, data, and leadership — for building performant, impactful, beautiful software.

---

## Discovery & Product

### 1. `wf-discover`
**Role:** Product / Research | **When:** Before intake
Competitive analysis, user pain point mapping, and market context gathering. Web-searches competitors, reads app store reviews, checks analytics dashboards (if accessible), synthesizes into a problem validation brief. Prevents building the wrong thing.
- **Produces:** `00-discover.md` — problem evidence, user quotes, competitor screenshots, opportunity sizing
- **Feeds into:** `wf-intake` with validated problem statement instead of gut feeling

### 2. `wf-experiment`
**Role:** Product / Data | **When:** After shape, parallel to plan
Design an A/B test or feature experiment: hypothesis, control/variant definition, success metrics, sample size calculation, duration estimate, feature flag strategy. Ensures features ship with measurable impact, not just "we think it's better."
- **Produces:** `XX-experiment.md` — hypothesis, metrics, flag config, analysis plan
- **Feeds into:** `wf-instrument` for telemetry, `wf-impact` for measurement

### 3. `wf-impact`
**Role:** Product / Data / Leadership | **When:** After ship (post-deploy)
Post-ship impact measurement: check analytics dashboards, compare metrics before/after, gather user feedback signals (support tickets, app reviews, NPS), assess whether the hypothesis was validated. Closes the build-measure-learn loop that retro alone doesn't cover.
- **Produces:** `11-impact.md` — metric deltas, user feedback, hypothesis verdict, follow-up recommendations
- **Turns retro from** "what went well in the process" **into** "did this actually matter"

---

## Design & UX

### 4. `wf-design`
**Role:** Design / Frontend | **When:** Between shape and slice
Design specification: component inventory, interaction patterns, responsive breakpoints, motion/animation specs, design token mapping, empty states, error states, loading states. Uses Pencil MCP tools or Figma references. Ensures engineers build what design intended, not their interpretation.
- **Produces:** `02b-design.md` — component map, state matrix, interaction specs, design token references
- **Prevents:** "That's not what the mockup showed" — the #1 design-engineering friction point

### 5. `wf-polish`
**Role:** Design / Frontend | **When:** After implement, before or parallel to verify
Visual and UX polish pass focused on what automated tests can't catch: micro-interactions, animation timing, hover/focus/active states, empty states, skeleton loaders, error recovery flows, responsive edge cases, dark mode, typography hierarchy. Uses dev-browser/screenshots to verify visual quality.
- **Produces:** `05b-polish.md` — polish checklist with before/after screenshots
- **This is where "beautiful" happens** — code correctness is necessary but not sufficient

### 6. `wf-ux-audit`
**Role:** Design / QA | **When:** After implement, before review
Heuristic evaluation of the implemented feature against Nielsen's 10 usability heuristics + platform-specific HIG (Material, HIG, Fluent). Not code review — user experience review. Walks through every user flow with dev-browser/Maestro, evaluates cognitive load, discoverability, error recovery, consistency.
- **Produces:** `06b-ux-audit.md` — heuristic scores, flow walkthroughs with screenshots, usability findings
- **Catches:** Technically correct but confusing UX before real users hit it

---

## Performance & Reliability

### 7. `wf-benchmark`
**Role:** Engineering / SRE | **When:** Before implement (baseline) and after implement (comparison)
Performance benchmarking with before/after measurement: define metrics (load time, TTI, FCP, API latency p50/p95/p99, memory, bundle size, APK size), capture baseline, set targets, measure after implementation, flag regressions. Uses Lighthouse, `wrk`/`k6`/`autocannon`, Android profiler, `bundlesize`.
- **Produces:** `05c-benchmark.md` — baseline metrics, targets, post-impl measurements, delta analysis
- **This is where "performant" happens** — you can't improve what you don't measure

### 8. `wf-load-test`
**Role:** SRE / Backend | **When:** After implement, before ship
Load and stress testing: define SLOs (latency p99 < 200ms at 1000 RPS), design traffic patterns, simulate realistic load with k6/Locust/Artillery, identify breaking points, measure degradation curves. Essential for any feature touching hot paths.
- **Produces:** `06c-load-test.md` — SLO definitions, traffic scenarios, breaking point, bottleneck analysis
- **Prevents:** "It worked in staging" that falls over at 10x traffic

### 9. `wf-profile`
**Role:** Engineering | **When:** After benchmark reveals regression, or during implement for hot paths
Deep performance profiling: CPU flamegraphs, memory allocation traces, database query analysis (N+1 detection, slow query log), network waterfall, rendering performance (React profiler, Android systrace). Turns "it's slow" into "this function allocates 50MB on every request."
- **Produces:** Analysis report with annotated flamegraphs, specific optimization recommendations
- **Type:** Skill (invoked from implement or verify, not a stage)

---

## Security & Compliance

### 10. `wf-threat-model`
**Role:** Security / Engineering | **When:** During shape or plan
STRIDE-based threat modeling: enumerate assets, trust boundaries, data flows, attack surfaces. For each threat: likelihood, impact, existing mitigations, required mitigations. Produces a threat model that feeds into review's security commands with targeted context.
- **Produces:** `02c-threat-model.md` — asset inventory, trust boundary map, threat matrix, mitigation plan
- **Shifts security left** — finding auth bypass in shape costs 1/100th of finding it in production

### 11. `wf-compliance`
**Role:** Security / Legal / Engineering | **When:** During shape (for requirements) and before ship (for verification)
Regulatory compliance checklist for the feature: GDPR (data processing, consent, right to erasure), HIPAA (PHI handling), SOC2 (access controls, audit logging), PCI (payment data), accessibility (WCAG 2.1 AA). Maps each requirement to implementation evidence.
- **Produces:** `XX-compliance.md` — regulation matrix, requirement-to-evidence mapping, gaps
- **Prevents:** Legal discovering a compliance gap after ship

### 12. `wf-dependency-audit`
**Role:** Security / Engineering | **When:** During plan (for decision-making) and before ship (for final check)
Supply chain security audit: `npm audit`/`pip-audit`/`cargo audit`, license compatibility check (GPL contamination, commercial license conflicts), transitive dependency analysis, SBOM generation, CVE check against NVD. Actionable — not just "you have 47 vulnerabilities" but prioritized by reachability and exploitability.
- **Produces:** `XX-dependency-audit.md` — vulnerability inventory, license matrix, upgrade recommendations
- **Type:** Could be a skill invoked from plan and ship

---

## Data & Observability

### 13. `wf-instrument`
**Role:** Engineering / SRE / Data | **When:** During plan or implement
Observability instrumentation plan: what to log (structured events with wide-event pattern), what to trace (distributed trace spans), what to alert on (SLO breach, error rate spike, latency degradation), what dashboards to create. Maps each acceptance criterion to an observable signal.
- **Produces:** `04b-instrument.md` — event schema, trace spans, alert rules, dashboard spec
- **Ensures:** Features ship with observability from day one, not bolted on after the first incident

### 14. `wf-migrate`
**Role:** Engineering / DBA | **When:** During plan (for strategy) or parallel to implement
Database and data migration planning: zero-downtime migration strategy (expand-contract, dual-write, backfill), rollback SQL, data validation queries, estimated migration duration, lock analysis, index impact. For non-DB migrations: API version migration, config format migration, state machine transitions.
- **Produces:** `04c-migrate.md` — migration strategy, rollback plan, validation queries, estimated duration
- **Prevents:** "The migration locked the users table for 45 minutes during peak traffic"

---

## QA & Testing

### 15. `wf-explore-test`
**Role:** QA / Engineering | **When:** After implement, parallel to verify
Exploratory testing session: structured charter-based exploration of the implemented feature. Test beyond the happy path — adversarial inputs, rapid state changes, network failures, concurrent access, boundary values, locale edge cases. Uses dev-browser/Maestro/adb to interact with the running app and capture evidence.
- **Produces:** `06d-explore-test.md` — charter, session notes, bugs found with reproduction steps + screenshots
- **Catches:** The bugs that scripted tests never imagined

### 16. `wf-accessibility`
**Role:** QA / Design / Frontend | **When:** After implement, before review
First-class WCAG 2.1 AA compliance audit — not a review checkbox but a full evaluation: automated scan (axe-core, Lighthouse accessibility), keyboard navigation test (every interactive element reachable and operable), screen reader test (semantic HTML, ARIA labels, focus management, live regions), color contrast verification, motion/animation respect for `prefers-reduced-motion`.
- **Produces:** `06e-accessibility.md` — WCAG criterion matrix, automated scan results, keyboard/SR test evidence
- **This is non-negotiable for "beautiful"** — inaccessible software isn't beautiful, it's exclusionary

---

## DevOps & Operations

### 17. `wf-rollout`
**Role:** SRE / Engineering | **When:** Between ship (approval) and retro (observation)
Gradual rollout orchestration: canary deployment with metric gates (error rate < baseline + 0.1%), progressive traffic shifting (1% → 10% → 50% → 100%), automatic rollback triggers, feature flag percentage ramp, health check definition. Turns `wf-ship`'s rollout plan into executable steps.
- **Produces:** `09b-rollout.md` — rollout stages, metric gates per stage, rollback triggers, current progress
- **Bridges:** The gap between "approved to ship" and "fully deployed"

### 18. `wf-incident`
**Role:** SRE / Engineering | **When:** Triggered by production incident
Incident-driven workflow creation: ingest incident context (error logs, alerts, timeline), auto-generate a `wf-intake` with pre-populated problem statement, affected areas from stack traces, and severity classification. Creates a fast-track workflow that skips shape/slice for critical hotfixes.
- **Produces:** Pre-populated `01-intake.md` + fast-track plan
- **Closes the loop:** Production incident → structured fix workflow → verified fix → postmortem

---

## Architecture & Knowledge

### 19. `wf-api-design`
**Role:** Engineering / Product | **When:** During shape or plan, for any feature exposing API surface
API contract design: resource modeling, endpoint naming (REST) or query/mutation design (GraphQL) or service definition (gRPC), versioning strategy, error shape standardization, pagination pattern, rate limiting, authentication/authorization model, OpenAPI/protobuf spec generation.
- **Produces:** `02d-api-design.md` + generated spec file (OpenAPI YAML, .proto, GraphQL schema)
- **Prevents:** Inconsistent APIs that become permanent public contracts

### 20. `wf-context`
**Role:** Engineering / All | **When:** Anytime (generates reusable context files)
Pre-computed context files a la Meta's April 2026 paper: one ~1,000-token file per module capturing tribal knowledge, naming conventions, non-obvious patterns, ownership, and architectural constraints. Multi-agent generation with critic review. Proven to reduce agent tool calls by 40%.
- **Produces:** `.ai/context/<module>.md` files with YAML frontmatter
- **Force multiplier:** Every subsequent workflow stage runs faster and more accurately because agents start with structural understanding instead of raw grep

---

## Summary Table

| # | Command | Role | When | Impact |
|---|---------|------|------|--------|
| 1 | `wf-discover` | Product / Research | Before intake | Validates problem before building |
| 2 | `wf-experiment` | Product / Data | After shape | Ships features with measurable impact |
| 3 | `wf-impact` | Product / Data / Leadership | After ship | Closes build-measure-learn loop |
| 4 | `wf-design` | Design / Frontend | Between shape and slice | Eliminates design-engineering friction |
| 5 | `wf-polish` | Design / Frontend | After implement | Makes software beautiful |
| 6 | `wf-ux-audit` | Design / QA | After implement | Catches confusing UX before users |
| 7 | `wf-benchmark` | Engineering / SRE | Before + after implement | Makes software performant |
| 8 | `wf-load-test` | SRE / Backend | After implement | Prevents production failures at scale |
| 9 | `wf-profile` | Engineering | During implement | Turns "slow" into actionable fix |
| 10 | `wf-threat-model` | Security / Engineering | During shape/plan | Shifts security left |
| 11 | `wf-compliance` | Security / Legal | During shape + before ship | Prevents compliance gaps |
| 12 | `wf-dependency-audit` | Security / Engineering | During plan + before ship | Supply chain safety |
| 13 | `wf-instrument` | Engineering / SRE / Data | During plan/implement | Day-one observability |
| 14 | `wf-migrate` | Engineering / DBA | During plan | Zero-downtime data migrations |
| 15 | `wf-explore-test` | QA / Engineering | After implement | Finds bugs tests never imagined |
| 16 | `wf-accessibility` | QA / Design / Frontend | After implement | Non-negotiable for beautiful software |
| 17 | `wf-rollout` | SRE / Engineering | After ship approval | Safe gradual deployment |
| 18 | `wf-incident` | SRE / Engineering | Production incident | Fast-track incident → fix workflow |
| 19 | `wf-api-design` | Engineering / Product | During shape/plan | Consistent API contracts |
| 20 | `wf-context` | Engineering / All | Anytime | 40% fewer agent tool calls |

## Role Coverage

| Role | Commands |
|------|----------|
| **Product** | wf-discover, wf-experiment, wf-impact |
| **Design** | wf-design, wf-polish, wf-ux-audit |
| **Engineering** | wf-benchmark, wf-profile, wf-api-design, wf-migrate, wf-context |
| **QA** | wf-explore-test, wf-accessibility, wf-load-test |
| **Security** | wf-threat-model, wf-compliance, wf-dependency-audit |
| **SRE/DevOps** | wf-instrument, wf-rollout, wf-incident |
| **Data** | wf-experiment, wf-instrument, wf-impact |
| **Leadership** | wf-impact, wf-discover (problem validation evidence) |

## Gap Coverage

The current pipeline covers the **engineering inner loop** well (plan → implement → verify → review → ship). These 20 commands extend it into the **full product development lifecycle** — from problem validation through design quality, performance, security, observability, gradual rollout, and impact measurement.

## Research Sources

- Meta Engineering Blog (April 2026) — pre-computed context files, 40% fewer tool calls
- GitHub Spec Kit — spec-driven development, spec drift detection
- OpenAI Codex Security — agentic threat modeling with sandbox validation
- CSA MAESTRO Framework — seven-layer agentic AI threat model architecture
- CodeScene — behavioral code health, churn x complexity x defect correlation
- IEEE Software (2025) — AI-agentic test generation with semantic feedback loops
- World Quality Report 2025-26 — shift-right production telemetry-driven testing
- Cursor Cloud Agents — event-triggered workflow advancement
- Devin AI — closed-loop self-healing build pattern
- Nielsen Norman Group — 10 usability heuristics for heuristic evaluation
- WCAG 2.1 — Web Content Accessibility Guidelines
- Harness AIDA — AI-predicted deployment risk with auto-rollback
- OpenTelemetry GenAI SIG — standardized AI workload observability
