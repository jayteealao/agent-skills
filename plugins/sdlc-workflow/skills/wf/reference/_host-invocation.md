# Shared host contract — invocation, paths, availability (single source)

This plugin runs under three hosts from one tree: Claude Code, Codex, and pi. Skill prose is written once, in a host-neutral form. This file maps that form to each host. Every other skill file cites this file, `_gate-question.md`, `_subagents.md`, or `_timestamp.md` instead of naming a host mechanism.

## Invocation spelling

Prose writes every skill invocation with a leading slash: `/wf <key> …`, `/consult …`, `/imagery …`, `/uiproto …`, `/diataxis …`, `/study-sources …`. Substitute the sigil for your host. Never substitute the name, the key, or the arguments.

| Host | The user types | Example |
|---|---|---|
| Claude Code | `/<skill> …` | `/wf status`, `/consult plan` |
| Codex | `$<skill> …` | `$wf status`, `$consult plan` |
| pi | `/skill:<skill> …` | `/skill:wf status`, `/skill:consult plan` |

Three rules follow:
- When you tell the user what to run, write the invocation in your host's spelling.
- When you write an invocation into an artifact (`next-invocation`, `recommended-next-invocation`, `Next:` lines), write the neutral `/wf …` form. The host that reads the artifact substitutes.
- `wf` is never a shell command. On Windows a bare `wf` opens the Firewall console. Do not run it.

## Codex invocation policy

All six plugin skills (`wf`, `consult`, `diataxis`, `study-sources`, `imagery`, and `uiproto`) are explicit-only in Codex. Each `agents/openai.yaml` sets `policy.allow_implicit_invocation: false`. Users can still select a skill with `$<skill>`; a matching task description does not authorize automatic selection. Do not start this plugin's skills merely because they could help with a task. Shared prose that allows autonomous skill selection applies only on hosts that permit it. Steps required by a workflow the user explicitly requested remain part of that requested run; this does not authorize unrelated skill runs. The [official skill documentation](https://learn.chatgpt.com/docs/build-skills#optional-metadata) defines `false` as blocking implicit invocation while preserving explicit invocation; the earlier claim that it hides skills entirely is obsolete. This policy controls skill selection; the separately configured hooks still run on their registered events.

## Path spelling

| Spelling | Meaning | Rule |
|---|---|---|
| `reference/<file>.md`, `../../reference/<file>.md` | A prose reference, relative to the citing file | Read it from that relative location. |
| `<skill-dir>` | The directory the current SKILL.md loads from | Resolve it before you run the command. The literal string must never reach a shell. |

Commands the model runs are written `node "<skill-dir>/scripts/<name>.mjs" …`. Resolve `<skill-dir>` per host:

| Host | `<skill-dir>` resolves to |
|---|---|
| Claude Code | `${CLAUDE_PLUGIN_ROOT}/skills/<skill>` — the plugin root variable the host exports |
| Codex | The directory of the loaded SKILL.md inside the installed plugin snapshot |
| pi | `${CLAUDE_PLUGIN_ROOT}/skills/<skill>` — pi-code substitutes the same variable when it loads the plugin from the Claude Code plugin cache |

No skill file names a host's plugin-root variable. Those variables live only in the per-host hook wiring: `hooks/hooks.json` (Claude Code, and pi through pi-code) and `hooks/codex.hooks.json` (Codex).

## Key availability

Every key in the `wf` dispatch table runs under every host, with one exception:

| Key | Hosts | Why |
|---|---|---|
| `yolo` | Claude Code only | Built on Claude Code's Workflow tool. Codex and pi have no equivalent. There is no Codex `$wf yolo` and no pi `/skill:wf yolo`. |

Under Codex or pi, treat `yolo` as an unknown key: name the restriction and point the user to `/wf auto`.

## pi runs through pi-code

pi has no plugin manifest and no external-command hooks of its own. The `pi-code` extension loads this plugin from the Claude Code plugin cache (`~/.claude/plugins/cache`), runs `hooks/hooks.json` with the Claude Code payload and environment, and presents Claude Code's tool vocabulary to the hooks and to the model. The reference pi setup is the `pi-unified` meta-package: pi-code without its own web and sub-agent extensions, `@tintinweb/pi-subagents` owning the `Agent` tool, and `pi-web-access` owning web search. A pi row below therefore reads "same as Claude Code" unless it says otherwise. Four differences hold: the `PermissionRequest` hook never fires, because pi has no permission layer; the `SubagentStart` and `SubagentStop` hooks never fire, because pi-code bridges them through its own sub-agent extension, which the reference setup excludes, so a child starts with nothing but its prompt; a `PreToolUse` hook that times out fails closed at 60 seconds; and the hub records a pi session's provenance as `claude`, because the host signal is the hooks' own. These rows are verified against pi-code 1.0.64 and pi-subagents 0.19.0 source, not yet against a live pi session.

## Host surfaces the shared prose never names

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Gate questions | [_gate-question.md](_gate-question.md) | [_gate-question.md](_gate-question.md) | [_gate-question.md](_gate-question.md) |
| Sub-agents | [_subagents.md](_subagents.md) | [_subagents.md](_subagents.md) | [_subagents.md](_subagents.md) |
| Timestamps | [_timestamp.md](_timestamp.md) | [_timestamp.md](_timestamp.md) | [_timestamp.md](_timestamp.md) |
| Managed-artifact enforcement | A pre-write hook blocks an invalid full-content write before it lands; a post-write hook verifies every write (schema, sibling `.yaml`, fragment) and returns corrective feedback | A pre-write hook denies a full-content write of an invalid artifact; a post-write hook verifies every write; the Stop hook blocks the turn until the artifact is repaired, bounded by a repair ceiling | Same as Claude Code |
| Leak guards (internal vocabulary in public docs and commit messages) | Pre-write and shell hooks scan when `semantic.enabled` is on | Not wired; nothing scans | Same as Claude Code |
| Whole-repo render refresh at session start | Queued by the SessionStart hook | Queued by the SessionStart adapter | Same as Claude Code |
| Sub-agent context injection | The SubagentStart hook injects the workflow context into every child | The SubagentStart adapter injects it | Not wired; the coordinator's prompt carries everything, per [_subagents.md](_subagents.md) |
| Progress surface | None required | Use the built-in plan tool for nontrivial work when it is available | None required |
| Durable repo guidance | `CLAUDE.md` and `AGENTS.md` | `AGENTS.md` | `CLAUDE.md` and `AGENTS.md` |
| Session transcripts (deep retro) | `~/.claude/projects/<repo-path-slug>/*.jsonl` — the repo's absolute path with separators replaced | None. Deep retro falls back to the artifact-only reading | None verified. Deep retro falls back to the artifact-only reading |
| Browser and runtime drive (probe, verify) | The session's browser pane and Chrome connector tools | The Browser or Chrome plugin when installed; otherwise a Playwright script | A Playwright script |
| Built-in image generation (imagery) | None; use the scripted providers | The built-in `image_gen` tool | None; use the scripted providers |
| Context compaction | Compact the session; the SessionStart hook re-reads the control files afterwards | Compact the session; the SessionStart hook re-reads the control files afterwards | Same as Claude Code |

The enforcement timing differs by design. The verification outcome does not: the same bundled runtime validates the artifact under every host.
