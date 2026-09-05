# Investigate research charters (Step 2 of `intake/investigate.md`)

Step 2 of `/wf intake investigate` dispatches the three sub-agents below in two waves: the cartographer and the option generator in parallel, then the tradeoff characterizer after both return. Every dispatch is read-only. The effort rubric named below is the one in `intake/investigate.md` (`# Effort rubric`); pass it word for word into any prompt that needs it.

**Effort tier for every dispatched agent:** **medium** (per [_subagents.md](../../_subagents.md)). REQUIRED on every dispatch. Investigation is judgment-heavy: the Cartographer must surface non-obvious architectural constraints, the Option generator must trade off across the design space, the Tradeoff characterizer must reason about effort/risk/blast-radius. Low effort underserves the abstraction-critique work; high is overkill since each agent still runs against a bounded scope.

## Wave 1 — cartographer ∥ option generator (launch simultaneously)

### research sub-agent 1 — Architecture cartographer

Prompt with ALL of the following:
- The problem: `<word for word from Step 1>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- Your job is to **map the relevant code area** so options can be grounded. Do not propose solutions; that is sub-agent 2. Produce a faithful map.
- Identify: entry points into the area, the call graph from those entry points 2–3 levels deep, the data model touched by the area, integration boundaries (DB, external services, message queues), existing tests that cover this area, configuration/feature flags that change behavior in this area, recent churn (`git log --oneline --since="90 days ago" -- <area>`).
- Identify **constraints encoded in the architecture itself**: patterns that any option would need to respect (existing abstractions, dependency-injection wiring, error-handling style, transaction boundaries, async boundaries). These constraints are usually invisible until you try to violate them.

Return as structured text:
- `entry_points`: list of `{file:line, signature, one_line_description}`.
- `call_graph_summary`: prose, 1 paragraph: the main flow from entry points through the affected area.
- `data_touched`: list of `{type_or_table, where_defined: file:line, used_at: [file:line]}`.
- `integration_boundaries`: list of `{boundary_type, file:line, description}` (DB calls, external APIs, message bus, cache, file system, and so on).
- `existing_tests`: list of `{file:line, what_it_covers}`.
- `runtime_config_flags`: list of `{flag_or_env, file:line, what_it_changes}` (or "none found").
- `recent_churn`: list of files changed >3x in last 90 days, with a one-line "why" guess from commit messages.
- `architectural_constraints`: list of `{constraint, where_it_shows_up, one_line_implication}`: invariants any solution must respect.

### research sub-agent 2 — Option generator

Prompt with ALL of the following:
- The problem: `<word for word>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- Your job is to enumerate **every genuinely distinct engineering approach** that could solve the problem within the current architecture (or, if you must violate it, name the violation explicitly as part of the option). The distinctness requirement below is the only ceiling; typically 2–5 mechanisms exist. Report exactly as many as you find: do not stop at 3 because it feels complete, and do not pad with a near-duplicate to reach a count. Selection for presentation happens at synthesis, not here.
- Distinctness requirement: options must differ in *mechanism*, not just in surface choices. "Cache at layer X" vs. "cache at layer Y" is one option, not two, unless the layers materially change correctness or operational profile. "Add a cache" vs. "denormalize the data model" vs. "compute lazily on demand" are three distinct options.
- For each option, do a light read of the affected area to confirm it is at least plausible (no obvious blocker like "this code path is generated and cannot be edited").
- Name each option with a short, descriptive label (≤6 words): not "Option A" but "In-process LRU cache on the resolver".
- Do not estimate effort, risk, or rank options; that is sub-agent 3.

Return as structured text:
- `options`: list of `{id: sequential letter (A, B, C, D, …), label, mechanism: one_paragraph, primary_files_touched: [path], requires_new_dependency: bool, requires_schema_change: bool, requires_architecture_violation: <none or one_line>, plausibility_check: one_line}`.
- `options_considered_and_rejected`: list of `{label, why_rejected: one_line}`: approaches you thought of but did not include (transparency for the reader; helps avoid "why didn't you consider X?"). Merit rejections only (implausible, blocked, dominated), NOT an overflow bin for viable distinct options; every viable distinct mechanism belongs in `options`.

## Wave 2 — tradeoff characterizer (launch after both Wave 1 agents return)

### research sub-agent 3 — Tradeoff characterizer

Prompt with ALL of the following:
- The problem: `<word for word>`. The starting area: `<from question 2>`. The constraints: `<from question 3>`.
- Sub-agent 2's full `options` list, word for word.
- Sub-agent 1's `architectural_constraints` and `integration_boundaries`, word for word. Judge each option against the mapped architecture, and flag any option that collides with a constraint or boundary.
- The effort rubric (from `# Effort rubric`), word for word.
- For each option, however many sub-agent 2 returned, including any beyond three, characterize:
  - **Effort:** small | medium | large, per the effort rubric.
  - **Blast radius:** narrow (one module, one code path), moderate (one subsystem, several code paths), wide (cross-cutting, multiple subsystems).
  - **Reversibility:** easy (one-PR revert restores prior behavior), moderate (some data or config persists post-revert), hard (data migration or external state changes mean revert is not a no-op).
  - **Risk:** what specifically can go wrong; cite the failure mode, not just "it might break". Examples: "Cache invalidation: stale reads if upstream write skips the invalidation step", "Async boundary: ordering violations on concurrent writes", "Schema change: requires backfill which blocks deploys for the table size".
  - **Operational fit:** does this option need new observability, alerting, runbook entries, or on-call awareness? Does it interact poorly with existing infrastructure (rate limits, autoscaling, deploy gates)?
  - **Constraint compliance:** does the option honor every user-stated constraint (from Step 1 question 3)? Name the violated constraint if not.
  - **Decisive unknown:** the ONE assumption that, if false, kills this option, plus the cheapest way to check it (a measurement, a source read, a yes/no truth question). "None" is valid only when every load-bearing assumption was verified during characterization, never as a default.

For each option produce a comparable tradeoff card. Do not pick a winner; characterize each on its own terms.

Return as structured text:
- `tradeoff_cards`: list of `{option_id, effort, blast_radius, reversibility, top_risks: [one_line_each], operational_fit, honors_stated_constraints: yes | violates <constraint>, decisive_unknown: {assumption, cheapest_check} | none}`.
- `constraint_collisions`: list of `{option_id, constraint, one_line_implication}`: options that violate an architectural constraint or integration boundary from sub-agent 1's map (or "none").
- `cross_option_observations`: 1–2 lines on patterns across options (for example "All three require touching `auth/middleware.ts`; that file is the chokepoint regardless of option").
