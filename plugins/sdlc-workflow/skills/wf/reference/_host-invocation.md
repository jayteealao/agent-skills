# Shared host contract — invocation, paths, availability (single source)

This plugin runs under two hosts from one tree: Claude Code and Codex. Skill
prose is written once, in a host-neutral form. This file maps that form to
each host. Every other skill file cites this file, `_gate-question.md`,
`_subagents.md`, or `_timestamp.md` instead of naming a host mechanism.

## Invocation spelling

Prose writes every skill invocation with a leading slash: `/wf <key> …`,
`/consult …`, `/imagery …`, `/uiproto …`, `/diataxis …`, `/study-sources …`.
Substitute the sigil for your host. Never substitute the name, the key, or the
arguments.

| Host | The user types | Example |
|---|---|---|
| Claude Code | `/<skill> …` | `/wf status`, `/consult plan` |
| Codex | `$<skill> …` | `$wf status`, `$consult plan` |

Three rules follow:

- When you tell the user what to run, write the invocation in your host's
  spelling.
- When you write an invocation into an artifact (`next-invocation`,
  `recommended-next-invocation`, `Next:` lines), write the neutral `/wf …`
  form. The host that reads the artifact substitutes.
- `wf` is never a shell command. On Windows a bare `wf` opens the Firewall
  console. Do not run it.

## Path spelling

| Spelling | Meaning | Rule |
|---|---|---|
| `reference/<file>.md`, `../../reference/<file>.md` | A prose reference, relative to the citing file | Read it from that relative location. |
| `<skill-dir>` | The directory the current SKILL.md loads from | Resolve it before you run the command. The literal string must never reach a shell. |

Commands the model runs are written `node "<skill-dir>/scripts/<name>.mjs" …`.
Resolve `<skill-dir>` per host:

| Host | `<skill-dir>` resolves to |
|---|---|
| Claude Code | `${CLAUDE_PLUGIN_ROOT}/skills/<skill>` — the plugin root variable the host exports |
| Codex | The directory of the loaded SKILL.md inside the installed plugin snapshot |

No skill file names a host's plugin-root variable. Those variables live only in
the per-host hook wiring: `hooks/hooks.json` (Claude Code) and
`hooks/codex.hooks.json` (Codex).

## Key availability

Every key in the `wf` dispatch table runs under both hosts, with one
exception:

| Key | Hosts | Why |
|---|---|---|
| `yolo` | Claude Code only | Built on Claude Code's Workflow tool. Codex has no equivalent. There is no Codex `$wf yolo`. |

Under Codex, treat `yolo` as an unknown key: name the restriction and point the
user to `/wf auto`.

## Host surfaces the shared prose never names

| Concern | Claude Code | Codex |
|---|---|---|
| Gate questions | [_gate-question.md](_gate-question.md) | [_gate-question.md](_gate-question.md) |
| Sub-agents | [_subagents.md](_subagents.md) | [_subagents.md](_subagents.md) |
| Timestamps | [_timestamp.md](_timestamp.md) | [_timestamp.md](_timestamp.md) |
| Managed-artifact enforcement | A pre-write hook blocks an invalid artifact before it lands | A post-write hook verifies; the Stop hook blocks the turn until the artifact is repaired, bounded by a repair ceiling |
| Progress surface | None required | Use the built-in plan tool for nontrivial work when it is available |
| Durable repo guidance | `CLAUDE.md` and `AGENTS.md` | `AGENTS.md` |
| Session transcripts (deep retro) | `~/.claude/projects/<repo-path-slug>/*.jsonl` — the repo's absolute path with separators replaced | None. Deep retro falls back to the artifact-only reading |
| Browser and runtime drive (probe, verify) | The session's browser pane and Chrome connector tools | The Browser or Chrome plugin when installed; otherwise a Playwright script |
| Built-in image generation (imagery) | None; use the scripted providers | The built-in `image_gen` tool |
| Context compaction | Compact the session; the SessionStart hook re-reads the control files afterwards | Compact the session; the SessionStart hook re-reads the control files afterwards |

The enforcement timing differs by design. The verification outcome does not:
the same bundled runtime validates the artifact under both hosts.
