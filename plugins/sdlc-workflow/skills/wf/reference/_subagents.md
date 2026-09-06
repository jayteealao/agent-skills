# Shared sub-agent constraints (single source)

Read-only fan-outs (research perspectives, review dimensions, verify concerns)
run **parallel by default** — the constraint is cost and the limits below, not
availability. Delegation only happens when the model actually makes the host's
dispatch call: prose that says "launch sub-agents" means one dispatch call per
child, then collect the results. Every reference that dispatches sub-agents
cites this file instead of restating the rules. No other skill file names a
dispatch tool, an agent type, a model name, or an isolation flag.

A **research sub-agent** is a read-only child that returns findings as text
and writes nothing (Claude Code `Explore`; Codex `explorer`; pi `Explore`). A **research
pass** is one wave of them.

## Rules that hold under every host

- **Children read, the coordinator writes.** Mutation leases, sibling-fragment
  contracts, and `00-index.md` updates stay PARENT-owned. Children return
  findings and evidence as text (or files outside `.ai/`); the parent merges
  and writes. One exception: a stage file may delegate a named artifact to a
  child (the review dimensions write their own `07-review-*` files). The
  managed-artifact enforcement of the host still covers such a write. A child
  that must edit source files gets write isolation (table below) so parallel
  children never collide; children whose fixes must touch the same file run
  serially, in severity order.
- **Paths in a child prompt are absolute.** A child has no citing file, so a
  citing-file-relative path (`../review/x.md`, `_timestamp.md`) means nothing
  to it. Write `<skill-dir>/reference/…` in prompt templates and resolve every
  `<skill-dir>` per [_host-invocation.md](_host-invocation.md) before dispatch.
- **Children never ask.** A child must never reach for any rung of the
  gate-question ladder ([_gate-question.md](_gate-question.md)) — it will fail
  or stall. Gates belong to the coordinator; give children everything they
  need up front.
- **Depth 1.** Children never spawn grandchildren. The coordinator is always
  the session-level agent.
- **Effort tiering, not model pinning.** Prose names a tier; this file maps
  the tier to the host. **low** for mechanical, bounded extraction
  (inventories, structured reads, per-package research) and for rubric-driven
  review dimensions; **medium** for standard research, the judgment-heavy
  review rubrics (`architecture`, `security`), and fix
  dispatch; **high** only for judge, verify, and causal-reasoning children. A child must not silently
  inherit an expensive parent configuration for mechanical work.
- **Waves bounded by the host's concurrency.** Batch a larger fan-out (for
  example the 11-rubric review `all` aggregate) into waves of at most the
  host's advertised concurrency (default 6): dispatch a wave, collect it, then
  dispatch the next.
- **Non-interactive runs.** Under a headless run or the auto driver, children
  inherit the approval posture; any child action that needs an approval
  becomes an error. Keep children read-only there.
- **No sub-agents for trivial work.** Token cost scales linearly with
  fan-out. A single read or a one-file check is the coordinator's own job; so
  is any task cheaper to do than to delegate.
- **Steering rows travel with the child.** Inject the relevant `steer.md`
  entries into every child prompt — see [_steering.md](_steering.md).

## Host mapping

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Dispatch call | The `Agent` tool, one call per child; independent children in one message run concurrently | `spawn_agent` per child, then `wait_agent` on the wave | The `Agent` tool, one call per child. Children run in the background by default; collect each wave with `get_subagent_result` |
| Agent types | Built-in `general-purpose`; `Explore` for read-only research | Built-in `explorer` (read-heavy), `worker` (bounded execution), `default`. Never a custom `.codex/agents/*.toml` agent by name | Built-in `general-purpose`; `Explore` for read-only research |
| Effort tier → host setting | Pass `model:` on the call: low = `haiku`; medium and high = `sonnet`. Never `opus`, and never omit the pin — a child must not inherit the parent's model | Pass the reasoning effort on the spawn: low, medium, high | Pass `model:` on the call with the same tier aliases as Claude Code: low = `haiku`; medium and high = `sonnet`. Never omit the pin |
| Write isolation for a child that edits files | Pass `isolation: worktree` on the call; the coordinator merges the child's branch result | Partition the work by disjoint files; there is no worktree flag | Pass `isolation: worktree` on the call; the coordinator merges the child's branch result |
| Wave ceiling | Cost only; keep waves at 6 | The advertised concurrency of the session (`max_threads`, default 6) | Cost only; keep waves at 6. The host runs at most 10 children at once and queues the rest |
| Depth | Do not give a child the `Agent` tool | `max_depth` 1 | Do not give a child the `Agent` tool; the host allows one nesting level |
| Non-interactive posture | A headless session; any prompt is an error | `codex exec`; `--ask-for-approval never` must be intended | `pi -p`; any prompt is an error |
