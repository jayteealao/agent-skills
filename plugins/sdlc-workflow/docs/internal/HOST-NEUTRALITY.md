# Host neutrality — the single-source prose contract

Status: **LIVE contract, enforced by `scripts/verify-host-neutrality.mjs`** (landed
with the single-source merge, SINGLE-SOURCE-PLAN W6). The historical audit that
this gate descends from is `archived/CLAUDISM-AUDIT.md` — the codex tree's
2026-06/07 scan of Claude-only wording. That audit ran one way (Claude wording
must not appear in the Codex tree). This contract runs both ways over ONE tree.

## The rule

One plugin tree serves Claude Code and Codex. Skill prose under `skills/` and the
root `reference/` docs are written once, host-neutral. Text that names a host's
tools, commands, invocation syntax, model names, isolation flags, dispatch
machinery, shell time commands, or plugin-root variables is **host mechanics**,
and host mechanics live in exactly five files:

| File | Owns |
|---|---|
| `skills/wf/reference/_host-invocation.md` | Invocation spelling (`/wf` canonical; `$wf` under Codex), `<skill-dir>`, key availability, the host-surfaces table |
| `skills/wf/reference/_gate-question.md` | The three-rung gate-question ladder; the YAML question spec |
| `skills/wf/reference/_subagents.md` | Dispatch calls, agent types, effort tiers → host settings, write isolation, waves, depth |
| `skills/wf/reference/_timestamp.md` | Real UTC timestamps per shell |
| `skills/wf/reference/yolo.md` | The one Claude Code-only key's own reference (the reserve slot) |

Every other file states the INTENT and cites one of those files.

## What the budget does not cover

- **Availability annotations are data.** "Claude Code only", "both hosts", a
  `Hosts` column in a provider table. The gate excludes such lines.
- **Per-host wiring** — `hooks/hooks.json`, `hooks/codex.hooks.json`, the
  `agents/openai.yaml` interface stubs — is not prose and is not scanned.
- **Provider names in the provider role.** `consult` dispatches the external
  `codex` / `claude` / `gemini` CLIs; `imagery` lists Codex's built-in
  `image_gen` beside the scripted providers. Those are product names of the
  oracle panel, enumerated per file in the gate's `DATA_EXCEPTIONS`.
- **The doc site** has its own gate (`verify-doc-site.mjs` invariants e and f):
  every page that shows a `/wf` invocation carries the uniform host note, and no
  live doc names the deleted second plugin tree (the pre-merge Codex mirror).

## The gate

`node scripts/verify-host-neutrality.mjs` (also `npm run verify:neutrality`,
and `tests/unit/gates.test.mjs` runs it under `npm test`). Nine scan families
over `skills/**/*.md` and `reference/*.md`; fenced code blocks are exempt for
the tool and timestamp families (a literal shell command is data), never for
the sigil, plugin-root, or stale-tree families.

Two lists, kept separate on purpose:

- **Permanent exceptions** — the table above plus `DATA_EXCEPTIONS`, written
  into the script. Growing it means editing the gate, so the exception is
  visible in review.
- **Burndown allowlist** — `scripts/host-neutrality-allowlist.json`. Seeded
  EMPTY at cutover because the prose merge landed in full. It may only shrink:
  the gate compares it against the `origin/master` merge base and fails on any
  added path, on any entry whose file no longer matches a family, and on any
  entry whose file is missing. Outside a checkout with that ref the check
  degrades to baseline-only and says so.

## Spellings

| Concept | Neutral spelling | Wrong |
|---|---|---|
| Invocation | `/wf status`, `/consult plan` | `$wf status`, "the wf skill" |
| Executable in a skill | `node "<skill-dir>/scripts/x.mjs"` | `${CLAUDE_PLUGIN_ROOT}/skills/…`, `${PLUGIN_ROOT}/…` |
| Prose reference | `[_x.md](../_x.md)` relative to the citing file | an absolute or plugin-root path |
| Gate question | "ask ONE gate question per `_gate-question.md`" + a YAML question spec | naming the tool |
| Sub-agent | "dispatch at **medium** effort with write isolation per `_subagents.md`" | a model name, `Task`, `isolation: worktree`, `spawn_agent` |
| Timestamp | "the real UTC timestamp per `_timestamp.md`" | `date -u +…`, "via Bash" |
| Host difference | cite `_host-invocation.md`'s host-surfaces table | a "Codex note" paragraph |
