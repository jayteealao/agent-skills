# Shared subagent constraints (single source)

Codex multi-agent support is stable and on by default, so read-only fan-outs
(research perspectives, review dimensions, verify concerns) run **parallel by
default** — the constraint is cost and the limits below, not availability.
Delegation only happens when the model actually calls `spawn_agent` — prose
saying "launch sub-agents" means: call `spawn_agent` per child, then collect
with `wait_agent`. Every reference that dispatches sub-agents cites this file
instead of restating the rules.

- **Built-in agent types only.** Spawn `explorer` (read-heavy research/review),
  `worker` (bounded execution), or `default`. Do NOT depend on custom
  `.codex/agents/*.toml` agents by name — repo-local custom agents may not be
  spawnable (upstream bug); express specialization in the child's prompt.
- **Waves of ≤6.** `max_threads` defaults to 6 — batch larger fan-outs (e.g.
  the 33-dimension review `all` aggregate) into waves: spawn up to 6,
  `wait_agent` on the wave, then spawn the next.
- **Depth 1.** Children never spawn grandchildren (`max_depth` 1). The handoff
  fix/diagnosis subagent contract already fits this shape — the coordinator is
  always the session-level agent.
- **Children read, the coordinator writes.** Artifact writes, mutation leases,
  sibling-fragment contracts, and `00-index.md` updates stay PARENT-owned.
  Children return findings/evidence as text (or files outside `.ai/`); the
  parent merges and writes. (Stop-verify still covers any child that does
  write — but that is the exception path, not the design.)
- **Children never ask.** A child must never need `request_user_input` or any
  rung of the gate-question ladder ([_gate-question.md](_gate-question.md)) —
  it will fail or stall. Gates belong to the coordinator; give children
  everything they need up front.
- **Non-interactive runs.** Under `codex exec` / the auto driver, children
  inherit the approval posture; any child action needing an approval becomes
  an error. Keep children read-only there, or ensure `--ask-for-approval
  never` is intended.
- **Effort tiering, not model pinning.** Do not pin host-specific model names.
  Tier by reasoning effort: **low** for mechanical/bounded extraction
  (inventories, structured reads, per-package research), **medium** for
  standard research/review dimensions, **high** only for judge/verify/causal
  reasoning children. Children must not silently inherit an expensive parent
  configuration for mechanical work.
- **No subagents for trivial work.** Token cost scales linearly with fan-out.
  A single read or a one-file check is the coordinator's own job; so is any
  task cheaper to do than to delegate.
