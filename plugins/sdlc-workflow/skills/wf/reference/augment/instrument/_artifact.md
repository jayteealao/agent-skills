# Instrument — artifact template (`augment/instrument.md` Step 2)

Load this file from `instrument.md` when you write `04b-instrument.md`.

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
next-command: wf-implement
next-invocation: "/wf implement <slug>"
recommended-routes:
  - invocation: "/wf implement <slug>"
    reason: "<one phrase>"
    default: true
---
```

**Body sections (in order):**

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
