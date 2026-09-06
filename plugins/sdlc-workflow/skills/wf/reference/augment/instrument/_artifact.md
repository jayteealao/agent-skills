# Instrument — artifact template and sibling YAML (`augment/instrument.md` Step 2 and the Sibling YAML step)

Load this file from `instrument.md` when you write `04b-instrument.md` and its sibling `04b-instrument.yaml`.

## `04b-instrument.md` (Step 2)

**`04b-instrument.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: augmentation
augmentation-type: instrument
slug: <slug>
parent-workflow: <slug>
instrumentation-framework: <detected framework>
dark-paths-found: <N>
signals-designed: <N>
pii-warnings: <true|false>
status: ready
created-at: <real UTC timestamp per _timestamp.md>
---
```

**Body sections (in order):**

## The Instrumentation
<!-- STORY SECTION — first, and self-sufficient. must follow `../../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## 1. Current state

A table of instrumentation quality across the files in scope:

| File | Quality | Existing signals | Dark paths |
|------|---------|-----------------|------------|
| `path/to/file.ts` | good/partial/poor/dark | log: yes, metrics: no, traces: no | — or list |

Summary: `<N>` dark paths found across `<M>` files. Framework: `<detected>`.

## 2. Instrumentation plan

A table of what to add:

| File | Function/path | Signal type | Signal name | Key fields | Rationale |
|------|--------------|-------------|-------------|------------|-----------|
| `path/to/file.ts` | `functionName()` | log | `payment_processed` | `user_id`, `amount_cents`, `provider`, `duration_ms` | Verify payment outcome in production |

## 3. Signal designs

For each signal in the plan, the exact shape of the event/log/metric. Use the detected framework's idioms.

**Example (pino/Node):**
```typescript
// In path/to/file.ts — functionName()
logger.info({
  event: 'payment_processed',
  user_id: redact(user.id),   // hashed — PII
  amount_cents: payment.amount,
  provider: payment.provider,
  duration_ms: endTime - startTime,
  outcome: 'success' | 'failure',
  error_code: error?.code,    // null on success
}, 'payment processing complete');
```

**Example (Go/zerolog):**
```go
// In path/to/handler.go — ProcessPayment()
log.Info().
    Str("event", "payment_processed").
    Str("user_id", hashUserID(userID)).
    Int64("amount_cents", payment.Amount).
    Str("provider", payment.Provider).
    Int64("duration_ms", elapsed.Milliseconds()).
    Str("outcome", outcome).
    Msg("payment processing complete")
```

Adapt to the actual detected framework. Show the exact field names and types.

## 4. PII & security notes

List any fields in the plan that require special handling:

| Field | Risk | Recommended handling |
|-------|------|---------------------|
| `user.email` | PII | Hash with SHA-256 before logging |
| `payment.card_number` | PCI sensitive | Never log — use last-4 only |
| `auth_token` | Secret | Redact entirely |

If no PII concerns: write "No PII concerns identified in the planned signals."

## 5. Implementation notes

Specific guidance for `wf-implement`:
- Which files to touch and in what order (to avoid re-touching a file multiple times)
- Whether any new imports are needed (and whether they're already in `package.json` / `go.mod`)
- Whether any new environment variables are needed (e.g., `LOG_LEVEL`, `METRICS_ENDPOINT`)
- Any conflicts with the existing plan steps in `04-plan-*.md` that might affect ordering

This section is **direction, not a plan** — do not enumerate full implementation steps. `wf-implement` owns the implementation.

## Step — Sibling YAML `instrument`

After writing the instrument MD (`.ai/workflows/<slug>/04b-instrument.md`
or, when invoked as an augmentation under a slug,
`.ai/workflows/<slug>/augmentations/<inst-id>.md`), write a sibling
`.yaml` next to it with `artifact: instrument`. The view-layer renderer
projects this as a signal table (kind-coloured chips per row) plus a
dark-paths callout list and an optional PII-warning counter.

**Required whenever you write the `instrument` sibling YAML:** also write the
sibling `.html.fragment` next to it. First load
`../../_fragment-authoring.md` and follow
its wrapper, snippet, and verifier rules. The fragment must stay deterministic
from the sibling YAML (same YAML → byte-identical HTML) and pass
`scripts/verify-fragment.mjs` (Check 7) clean.

Shape:

```yaml
# 04b-instrument.yaml — or augmentations/<inst-id>.yaml
artifact:   instrument
framework:  "opentelemetry"
signals:
  - name: "checkout.attempt"
    kind: counter            # counter | gauge | histogram | log | trace | event
    path: "services/cart/handlers/checkout.ts:start"
    note: "Increment on every POST /checkout, before validation."
  - name: "checkout.duration_ms"
    kind: histogram
    path: "services/cart/handlers/checkout.ts:end"
  - name: "checkout.failure"
    kind: log
    pii:  true              # mark when payload contains user identifiers
    path: "services/cart/handlers/checkout.ts:catch"
    note: "Redact stripe_customer_id before emit."
  - name: "checkout.span"
    kind: trace
    path: "services/cart/handlers/checkout.ts:full"
dark_paths:
  - path:   "services/cart/promo/apply.ts:rejection"
    reason: "No signal on rejected promo codes — silent failure mode."
  - path:   "services/cart/webhooks/stripe.ts:retry"
    reason: "Retry loop has no histogram; cannot tell tail latency from happy path."
pii_warnings: 1
```

Authoring rules:
- `signals[]` must have at least one entry. `kind:` is required —
  the renderer colours each row by kind, so misclassifying a histogram
  as a counter gets the wrong visual treatment.
- Mark `pii: true` on any signal whose payload includes user-level
  identifiers (email, account id, IP). The renderer surfaces these
  with a redaction warning chip.
- `dark_paths[]` is optional but is usually the most useful section to
  a reviewer — it names places where the *absence* of signal is the
  finding. Skip when the audit found no dark paths (the chat summary
  already handles that case).
- `pii_warnings:` is the count of `pii: true` entries in `signals[]`.
  Keep them in sync — the renderer reads this directly for the badge.
