> **Ground findings in the real source.** Before asserting that an emit path, a collector config, or a dashboard
> query is wrong — a field that isn't emitted, a sampling rule that can't fire, a collector that can't reach the
> backend — invoke the `study-sources` skill to read the **actual installed source** (the logging library, the
> OTel SDK, the collector's real config schema). A finding grounded in the real implementation beats one grounded
> in a recalled API — the latter is exactly where plausible-but-wrong findings come from. Inject the same
> instruction into every lens sub-agent. Read-only — reads land in gitignored `.scratch/`.

You are running `wf project observability audit`. Your job is **not** to fix anything. It is to **question the
observability surface**: to read `.ai/observability.md`, the emit code / pipeline / backend / dashboards that
realize it, and the codebase, and surface every blind spot, schema drift, PII leak, sampling blunder, and
disconnected-pipeline hazard that would make production debugging fail when it matters — then route each to the
command that can fix it. This is the read-only, adversarial counterpart to `build`.

# Why this command exists (the gap it fills)

- **`observability build`** treats the contract as ground truth and closes the repo gap. If the contract is
  wrong, `build` faithfully builds the wrong surface.
- **`augment/instrument`** designs signals for **one change's** files against the existing foundation. It never
  reasons about the *project-wide* surface.

`audit` is the missing reasoning pass. It assumes **nothing** is sound — not the contract, not the emit code, not
the pipeline — and tries to break each on paper before an incident breaks it in production. Example of what only
this command catches: a schema (Block A) that declares `user.tier` but three call sites emit `userTier`,
`user_tier`, and nothing — so the "error-rate by cohort" dashboard silently groups everything into `null`. Valid
code, present in the repo, and useless when you page someone at 2am. `audit` is built for it.

# What this command does NOT do

- It does **not** edit `.ai/observability.md` — amend it by hand. It reports what to change and routes there.
- It does **not** create, patch, or provision anything — that is `/wf project observability build`.
- It does **not** re-run the deep code-correctness sweep. Its codebase lens is scoped to the **observability
  surface** (dark paths, schema consistency, PII in events, sampling). For a general bug-hunt it points at
  `/wf review sweep pre-merge`.
- The only file it ever writes is its own ledger, `.ai/observability-audit.md`.

---

# Step 0 — Orient

1. **Parse `$ARGUMENTS`.** The first token, if present, is either a **lens key** (run that one lens inline) or
   `triage` (re-surface `acknowledged` findings — see Step 5). No token → full fan-out across all seven lenses.
2. **Read `.ai/observability.md`.** STOP if missing: *"No observability contract at `.ai/observability.md`. There
   is nothing to audit yet — run `/wf project observability init` first."* Parse Blocks A–H (+ `additional-contracts[]`).
   Note `plan-version` and `updated-at`.
3. **Read the existing ledger** `.ai/observability-audit.md` if it exists. Parse `runs[]` and `findings[]` — this
   run merges into it, not overwrites it (Step 4). If absent, this is run 1.
4. **Index the built surface.** For each unit in Block B, read its emit path (schema module, sampling fn, event
   builder, redaction, call sites). Read the Block-E pipeline config, the Block-F backend/IaC files, and the
   Block-G dashboard files. Build an index shared into every lens sub-agent so they reason about the same
   evidence.
5. **Detect the languages** present so each lens tailors its checks (a Go unit's schema drift looks different from
   a Node unit's).

---

# Step 1 — The audit lenses

Each lens is one adversarial reviewer reasoning across all targets — **the contract, the built surface (code +
pipeline + backend + dashboards), and the codebase** — through one point of view. Findings use the standard
schema: `{ severity: BLOCKER|HIGH|MED|LOW|NIT, confidence: high|med|low, target, summary, evidence,
failure-scenario, route }`.

| Lens key | The question it asks | Primary target |
|---|---|---|
| `dark-path-coverage` | Which codebase paths / critical functions emit no queryable signal at all? (Codebase-wide — vs `instrument`'s per-slice scope.) A failure here is invisible in production. | codebase |
| `schema-consistency` | Do emitted events match the Block-A schema, or have keys drifted across call sites and languages (`userId` vs `user.id` vs `user_id`)? Divergent keys break every cohort query. | emit code + contract |
| `pii-and-redaction` | Are fields the Block-C policy should redact reachable in an emitted event? Secrets, tokens, PANs, raw emails, full request bodies, prod stack traces leaking to logs. | emit code + contract |
| `sampling-soundness` | Does Block-D actually keep the signal and sample the noise? A rule that can't fire (references a field never set), a base rate that drops errors, or a cost blow-up (everything kept). | sampling fn + contract |
| `one-event-discipline` | Diary logging: N log lines per unit of work instead of one enriched wide event. The anti-pattern the whole approach exists to kill. | emit code |
| `pipeline-and-backend` | Is the Block-E/F pipeline **wired**? Collector receiving from every unit, exporter pointed at the backend, retention set, endpoint an env var not a literal. Config-level soundness, not a live health check. | pipeline + backend config |
| `dashboard-coverage` | Are the Block-G analyses actually dashboarded, or is the schema collecting fields that **nothing queries**? A dashboard whose query references a field the emit code never sets. | dashboards + schema |

# Step 2 — Dispatch the fan-out (default) or one lens

**Default (no lens token) — full parallel fan-out.** Prepare ONE read-only dispatch per lens (all seven), per
[_subagents.md](../_subagents.md):
- Effort tier (set explicitly — reviewers must not inherit the parent configuration): **medium** for
  `dark-path-coverage`, `schema-consistency`, `pii-and-redaction`, and `sampling-soundness` (the reasoning-heavy
  lenses); **low** for `one-event-discipline`, `pipeline-and-backend`, and `dashboard-coverage`.
- `description: "obs-audit-<lens>"`.
- prompt = the lens's row question expanded into its concrete checklist + the parsed contract + the built-surface
  index from Step 0 + the languages present + the standard findings schema + the grounding instruction above +
  the refute-before-report rule + "return findings inline as a JSON list; write no files."

**Dispatch in parallel, in waves of ≤6** per [_subagents.md](../_subagents.md): one wave carrying six lenses,
collect it, then the seventh. Sequential single-lens dispatch is forbidden.

**Single-lens mode** (`$ARGUMENTS` first token is a lens key) — run just that lens inline over the same evidence,
merging its findings into the ledger exactly as the fan-out does.

## Refute-before-report (inside every lens prompt)

Instruct each lens: for every candidate finding, **first try to refute it** — read the real emit code / config /
dashboard text, and (where behavior is claimed) the real dependency source via `study-sources`. Report a finding
ONLY if it survives, with a concrete **failure-scenario** (the inputs/state → the wrong debugging outcome).
Default to dropping anything you cannot ground. A short list of real findings beats a long list of plausible ones.

# Steps 3 to 5 — Synthesize, merge into the ledger, triage

Apply Steps 3 to 5 of [_audit-ledger.md](../_audit-ledger.md) with `<ledger>` = `.ai/observability-audit.md`, `<plan>` = `.ai/observability.md`, `<audit>` = `/wf project observability audit` and `<harm>` = production debugging. These steps refute each BLOCKER and HIGH a second time, merge the survivors into the accumulating ledger, and record each triage decision, `accept` included.

- An id example: `schema-consistency:checkout-api:user-id-key-drift`.
- A `target` example: `contract block X`, `services/checkout/emit.ts:42`, `otel-collector-config.yaml`, `dashboards/error-rate.json`.

# Step 6 — Route every finding to its sanctioned fixer

`audit` fixes nothing — it hands each finding to the command that can. The `route` field and the chat `Next:` line
use this mapping:

| Finding is about… | Route to |
|---|---|
| The **contract's content** — a block is wrong, missing, or a policy is incoherent | amend `.ai/observability.md` block X by hand (name the block; an `edit` sub-key is the sanctioned future addition) |
| A **missing scaffold the contract implies but the repo lacks** — no emit path, no collector config, no dashboard | `/wf project observability build` |
| A **code-level leak or schema desync** — a call site emits the wrong key, a field the policy should redact | `/wf intake fix <scope>` (or direct guidance for a one-line fix) |
| **Deep code-correctness/security** beyond the observability surface | `/wf review sweep pre-merge` (pointer — `audit` does not own it) |

Derive the **verdict** from the open findings: `unsound` if any open BLOCKER · `ship-with-caveats` if open HIGH
but no BLOCKER · `sound` if neither (LOW/MED/NIT only, or clean).

# Step 7 — Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead in the audit voice (the verdict and the finding
that most threatens debuggability), then this receipt:
- `wrote: .ai/observability-audit.md`
- `plan-version: <v>` · `run: <N>` · `lens-scope: <all | lens>`
- `verdict: <sound | ship-with-caveats | unsound>`
- `findings (open): BLOCKER <n> | HIGH <n> | MED <n> | LOW <n> | NIT <n>`
- `resolved-this-run: <n>` · `acknowledged: <n>`
- `Next:` the single highest-leverage route from Step 6 (e.g. amend `.ai/observability.md` Block A then
  `/wf project observability build`), or `Done` if the verdict is `sound` and nothing is open.
