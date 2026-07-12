---
description: Read-only adversarial audit of the observability surface — questions whether `.ai/observability.md`, the emit code / pipeline / backend / dashboards it drives, and the codebase are actually SOUND, not merely present. Fans out one read-only child per lens (dark-path-coverage, schema-consistency, pii-and-redaction, sampling-soundness, one-event-discipline, pipeline-and-backend, dashboard-coverage), refutes each candidate finding before it lands, then merges survivors into an accumulating ledger at `.ai/observability-audit.md` and routes each to its sanctioned fixer. Never edits the contract, never mutates the repo, never provisions. Distinct from `build` (which trusts the contract and closes gaps) and from `augment/instrument` (per-change, per-slice scope).
argument-hint: "[<lens> | triage]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Ground findings in the real source.** Before asserting that an emit path, a collector config, or a dashboard
> query is wrong — a field that isn't emitted, a sampling rule that can't fire, a collector that can't reach the
> backend — invoke the `study-sources` skill to read the **actual installed source** (the logging library, the
> OTel SDK, the collector's real config schema). A finding grounded in the real implementation beats one grounded
> in a recalled API — the latter is exactly where plausible-but-wrong findings come from. Inject the same
> instruction into every lens child. Read-only — reads land in gitignored `.scratch/`.

You are running `wf observability audit`. Your job is **not** to fix anything. It is to **question the
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
- It does **not** create, patch, or provision anything — that is `$wf observability build`.
- It does **not** re-run the deep code-correctness sweep. Its codebase lens is scoped to the **observability
  surface** (dark paths, schema consistency, PII in events, sampling). For a general bug-hunt it points at
  `$wf review sweep pre-merge`.
- The only file it ever writes is its own ledger, `.ai/observability-audit.md`.

> **Optional second opinion.** After the ledger is written, you may offer `$consult <second opinion on these
> observability audit findings — are any wrong, any missed?>` (or `$consult <provider> …`). Model may self-run
> when clearly valuable; otherwise just offer it.

---

# Step 0 — Orient

1. **Parse `$ARGUMENTS`.** The first token, if present, is either a **lens key** (run that one lens inline) or
   `triage` (re-surface `acknowledged` findings — see Step 5). No token → full fan-out across all seven lenses.
2. **Read `.ai/observability.md`.** STOP if missing: *"No observability contract at `.ai/observability.md`. There
   is nothing to audit yet — run `$wf observability init` first."* Parse Blocks A–H (+ `additional-contracts[]`).
   Note `plan-version` and `updated-at`.
3. **Read the existing ledger** `.ai/observability-audit.md` if it exists. Parse `runs[]` and `findings[]` — this
   run merges into it, not overwrites it (Step 4). If absent, this is run 1.
4. **Index the built surface.** For each unit in Block B, read its emit path (schema module, sampling fn, event
   builder, redaction, call sites). Read the Block-E pipeline config, the Block-F backend/IaC files, and the
   Block-G dashboard files. Build an index shared into every lens child so they reason about the same evidence.
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

**Default (no lens token) — full parallel fan-out.** Spawn ONE read-only `explorer` child per lens (all seven),
per [_subagents.md](../_subagents.md):

- **Effort-tiered, not model-pinned** — children must not inherit an expensive parent configuration. **high**
  effort for the causal-reasoning lenses `dark-path-coverage`, `schema-consistency`, `pii-and-redaction`, and
  `sampling-soundness`; **medium** for `one-event-discipline`, `pipeline-and-backend`, and `dashboard-coverage`.
- `description: "obs-audit-<lens>"`.
- prompt = the lens's row question expanded into its concrete checklist + the parsed contract + the built-surface
  index from Step 0 + the languages present + the standard findings schema + the grounding instruction above +
  the refute-before-report rule + "return findings inline as a JSON list; write no files."

**Dispatch in parallel, in waves of ≤6** per [_subagents.md](../_subagents.md): issue one message spawning the
first six children, `wait_agent` on the wave, then spawn the seventh. Sequential single-child dispatch is forbidden.

**Single-lens mode** (`$ARGUMENTS` first token is a lens key) — run just that lens inline over the same evidence,
merging its findings into the ledger exactly as the fan-out does.

## Refute-before-report (inside every lens prompt)

Instruct each lens: for every candidate finding, **first try to refute it** — read the real emit code / config /
dashboard text, and (where behavior is claimed) the real dependency source via `study-sources`. Report a finding
ONLY if it survives, with a concrete **failure-scenario** (the inputs/state → the wrong debugging outcome).
Default to dropping anything you cannot ground. A short list of real findings beats a long list of plausible ones.

# Step 3 — Synthesize + adversarial gate

1. **Collect** all lens findings. **Dedupe** by `(target + root cause)` — keep the most specific severity, merge
   rationales, tag with every lens that raised it.
2. **Normalize severity** to BLOCKER / HIGH / MED / LOW / NIT.
3. **Second refutation on the load-bearing ones.** For each BLOCKER and HIGH, independently re-read the cited
   evidence yourself and confirm the failure-scenario is real before it enters the ledger as `open`. Refute by
   default: if you cannot reproduce the reasoning from the evidence, downgrade its confidence or drop it.
4. **Assign a stable `id`**: `<lens>:<target-slug>:<issue-slug>` (e.g.
   `schema-consistency:checkout-api:user-id-key-drift`). The id is what the ledger dedupes on across runs.
5. **Route each finding** (Step 6 table).

# Step 4 — Merge into the accumulating ledger

The ledger `.ai/observability-audit.md` **accumulates** — never overwritten. Reconcile this run's survivors
against the parsed prior `findings[]`:
- **Still present** (same `id`) → keep `status: open`; update `last-seen`; refresh severity/evidence if changed.
- **New** (id not seen before) → add with `status: open`, `surfaced-at: <this run>`.
- **Gone** (a prior `open`/`acknowledged` id no lens raised this run) **and its target still exists** → mark
  `status: resolved`, `resolved-at: <this run>`. If the target itself is gone, resolve it noting the target
  vanished. Never silently delete — resolution is recorded.
- **Acknowledged** findings stay `acknowledged` until they disappear (→ resolved) or the user re-triages
  (`$wf observability audit triage`).

Write the ledger with this shape (frontmatter carries machine-readable state; the body tells the story):

```markdown
---
kind: observability-audit
audited-plan-version: <plan.plan-version>
plan-updated-at: <plan.updated-at>
last-run: <N>
verdict: <sound | ship-with-caveats | unsound>
runs:
  - run: <N>
    lens-scope: <all | the single lens>
    plan-version: <v>
    verdict: <...>
    counts: { blocker: <n>, high: <n>, med: <n>, low: <n>, nit: <n> }
findings:
  - id: <lens>:<target-slug>:<issue-slug>
    lens: <lens>
    target: <contract block X | services/checkout/emit.ts:42 | otel-collector-config.yaml | dashboards/error-rate.json>
    severity: <BLOCKER|HIGH|MED|LOW|NIT>
    confidence: <high|med|low>
    status: <open | acknowledged | resolved>
    surfaced-at: <run N>
    last-seen: <run N>
    resolved-at: <run N | ->
    route: <the exact fixer command>
---

## The Audit
<Narrative — the story section, per ../_narrative-voice.md (heading `## The Audit`). Lead with the verdict and the
one finding that most threatens production debuggability, in the Raschka voice: relevance first, why before how,
the stakes in human terms. Name what an on-call engineer would actually fail to see, not a checklist.>

## Verdict
<sound | ship-with-caveats | unsound> — <one sentence, tied to the highest-severity open finding>

## Open findings
<For each open finding, grouped by severity:>
### <id> — <severity> · <lens>
- **Target:** <contract block / file:line / dashboard>
- **What:** <the defect, one or two sentences>
- **Evidence:** <the concrete cite — the contract line, the code, the config>
- **Failure scenario:** <inputs/state → the wrong debugging outcome>
- **Route:** `<fixer command>`

## Resolved this run
<findings open last run and gone now — id + what it was + resolved-at>

## Acknowledged (proceeding with known risk)
<acknowledged findings + the recorded reason>
```

The ledger is a plain markdown file (like `.ai/observability.md` itself) — it takes **no sibling `.yaml`
fragment** (those belong to rich-tier artifacts under `.ai/workflows/`). It may ship a free narrative fragment
only if a bespoke visual genuinely tells the story better than prose.

# Step 5 — Triage the blockers and highs (interactive)

Before finalizing, triage each **BLOCKER and HIGH** open finding with the user by asking directly in chat —
present each as a short numbered item (finding text + failure scenario + suggested route) and let the user choose
**accept** (leave `open`), **acknowledge** (known/intentional — record a freeform reason, set
`status: acknowledged`), or **reject** (false positive — drop it; if it keeps re-surfacing, tighten the lens id).
MED/LOW/NIT land as `open` without a prompt.

**`triage` mode** (`$ARGUMENTS` == `triage`) skips the fan-out: re-read the ledger, re-present every
`acknowledged` finding, let the user re-decide, re-write the ledger, emit the summary.

# Step 6 — Route every finding to its sanctioned fixer

`audit` fixes nothing — it hands each finding to the command that can. The `route` field and the chat `Next:` line
use this mapping:

| Finding is about… | Route to |
|---|---|
| The **contract's content** — a block is wrong, missing, or a policy is incoherent | amend `.ai/observability.md` block X by hand (name the block; an `edit` sub-key is the sanctioned future addition) |
| A **missing scaffold the contract implies but the repo lacks** — no emit path, no collector config, no dashboard | `$wf observability build` |
| A **code-level leak or schema desync** — a call site emits the wrong key, a field the policy should redact | `$wf intake fix <scope>` (or direct guidance for a one-line fix) |
| **Deep code-correctness/security** beyond the observability surface | `$wf review sweep pre-merge` (pointer — `audit` does not own it) |

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
  `$wf observability build`), or `Done` if the verdict is `sound` and nothing is open.
