# Shared host contract — invocation, paths, availability (single source)

This plugin runs under three hosts from one tree: Claude Code, Codex, and pi. Skill prose is host-neutral. This file maps it to each host. Other skill files cite this file, [_gate-question.md](_gate-question.md), [_subagents.md](_subagents.md), [_timestamp.md](_timestamp.md), or `_host-surfaces.md` instead of naming a host mechanism. `_host-surfaces.md` holds the surfaces that only some stages use, one section each, and pi's differences ("pi through pi-code").

## Invocation spelling

Prose writes every skill invocation with a leading slash: `/wf <key> …`, `/consult …`, `/imagery …`, `/uiproto …`, `/diataxis …`, `/study-sources …`. Substitute only the sigil for your host, never the name, the key, or the arguments.

| Host | The user types | Example |
|---|---|---|
| Claude Code | `/<skill> …` | `/wf status`, `/consult plan` |
| Codex | `$<skill> …` | `$wf status`, `$consult plan` |
| pi | `/skill:<skill> …` | `/skill:wf status`, `/skill:consult plan` |

`$ARGUMENTS` is the text after the skill mention, and `$1` is its first whitespace token. Claude Code substitutes both before the model reads the skill body. Codex and pi do not: read them as the user's text after `$<skill>` or `/skill:<skill>`.

- When you tell the user what to run, use your host's spelling.
- In an artifact (`next-invocation`, `recommended-next-invocation`, `Next:` lines), write the neutral `/wf …` form.
- `wf` is never a shell command. On Windows a bare `wf` opens the Firewall console. Do not run it.

## Codex invocation policy

The six plugin skills are explicit-only in Codex (`policy.allow_implicit_invocation: false` in each `agents/openai.yaml`). Start one only when the user selects it with `$<skill>`, or when a requested workflow requires the step. The hooks still run on their registered events.

## Path spelling

A prose reference (`reference/<file>.md`, `../../reference/<file>.md`) is relative to the citing file. A command is written `node "<skill-dir>/scripts/<name>.mjs" …`. Resolve `<skill-dir>` before you run it; the literal string must never reach a shell.

| Host | `<skill-dir>` resolves to |
|---|---|
| Claude Code | `${CLAUDE_PLUGIN_ROOT}/skills/<skill>` |
| Codex | The directory of the loaded SKILL.md inside the installed plugin snapshot |
| pi | `${CLAUDE_PLUGIN_ROOT}/skills/<skill>` — pi-code substitutes the same variable |

No skill file names a plugin-root variable. Those live only in the hook wiring: `hooks/hooks.json` (Claude Code, and pi through pi-code) and `hooks/codex.hooks.json` (Codex).

## Key availability

<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
| Key | Claude Code | Codex | pi |
|---|---|---|---|
| `loop goal` | differs: the mod puts the /goal line into the prompt box | differs: the agent calls create_goal | differs: the person pastes the line that goal.mjs arm prints |
| `loop optimize` | full | gap: not available; the optimize driver runs only on Claude Code | gap: not available; the optimize driver runs only on Claude Code |
<!-- end generated -->

A `gap` is a part that does not run on that host; `differs` is a part that runs in another form. Every other key runs under every host in the same form.

## Host surfaces every stage uses

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Managed-artifact enforcement | A pre-write hook blocks an invalid full-content write; a post-write hook verifies every write (schema) and returns feedback | A pre-write hook denies an invalid full-content write; a post-write hook verifies every write; the Stop hook blocks the turn until the artifact is repaired, bounded by a repair ceiling | Same as Claude Code |
| Leak guards (internal vocabulary in public docs and commit messages) | Pre-write and shell hooks scan when `semantic.enabled` is on | Not wired | Same as Claude Code |
| Sub-agent context injection | Not wired: no SubagentStart hook runs. The coordinator's prompt carries everything ([_subagents.md](_subagents.md)) | The SubagentStart adapter injects the active slugs and stages, the child write discipline, and the External Output Boundary reminder | Same as Claude Code: the pi package runs the SubagentStart entries of `hooks/hooks.json`, and there are none |
| Workflow runtime (`yolo`, `campaign`) | The Workflow tool runs `workflows/yolo.js` | `wf.mjs drive` runs `workflows/yolo.js` under Node; each agent is one `codex exec` call | pi-subagents' SubagentWorkflow tool runs `workflows/yolo.js` |
| Progress surface | None required | The built-in plan tool, for nontrivial work, when available | None required |
| Durable repo guidance | `CLAUDE.md` and `AGENTS.md` | `AGENTS.md` | `CLAUDE.md` and `AGENTS.md` |
| Context compaction | No hook re-reads the control files. Re-read `00-index.md` and the stage artifacts before you continue | No hook re-reads the control files: the SessionStart adapter returns at once on a compaction. Re-read them yourself | Same as Claude Code |

The enforcement timing differs by design. The verification outcome does not: the same bundled runtime validates the artifact under every host.
