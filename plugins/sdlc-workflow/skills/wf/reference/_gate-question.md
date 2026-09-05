# Shared gate-question ladder (single source)

Every human gate in this workflow (compressed-lifecycle Proceed/Adjust/Escalate,
refactor branch/coverage gates, update-deps tier gate, ship go/no-go, the git-init precondition) asks its question through
this three-rung ladder. A citing site contributes ONLY its question text and
its options; this file owns the mechanics. No other skill file names a
question tool.

1. **Structured question (interactive, tool available).** Ask through the
   host's blocking question tool with the gate's question and its 2–4 options.
   Name the tool exactly; describe the question and options in plain
   language — do NOT invent a JSON parameter shape.

   | Host | Tool | When it is available |
   |---|---|---|
   | Claude Code | `AskUserQuestion` | Every interactive session |
   | Codex | `request_user_input_async` in default mode; `request_user_input` in plan mode | Every interactive session exposes one of the two. Use the one the session lists. When neither is listed, the call errors — use rung 2. |
   | pi | `AskUserQuestion` | Every interactive session. In print mode the tool disables itself; use rung 2 or rung 3. |

2. **Chat question (interactive, tool unavailable).** Ask ONE message that
   states the gate's question with the options as a numbered list, the
   recommended option first and marked, then WAIT for the reply. Map a
   free-text reply to the closest option. Do not proceed past the gate on
   silence.
3. **Non-interactive (headless runs, the auto driver, CI).** No user input is
   possible. Resolve by recorded policy: take the gate's documented default
   (its recommended option unless the citing site names a different
   non-interactive default), write the decision AND the assumption behind it
   into the gate's artifact — the `revisions:` ledger or an `assumptions:`
   field — and continue.

- **A question spec is host-neutral data.** A citing site may describe its
  question as a YAML block with `question`, `header`, `options` (each with a
  `label` and a `description`; the recommended option first, marked), and
  `multiSelect`. Under Claude Code or pi, pass the spec to the tool as written. Under
  Codex, render the spec as rung 1's plain-language description or as rung 2's
  numbered list. The spec never names a tool.
- **Never require structured input to proceed.** A gate must always be
  resolvable by rung 2 (free-text reply mapped to the closest option) or
  rung 3 (policy default). Rung 1 is an affordance, not a dependency.
- **Record the outcome regardless of rung.** Which rung fired, what was chosen,
  and (rung 3) what was assumed all land in the artifact body or ledger — the
  gate decision must be reconstructable from disk.
- **Children never ask.** Sub-agents must not reach for any rung; gates belong
  to the coordinating parent (see [_subagents.md](_subagents.md)).
- **A steering veto outranks a policy default** in an autonomous run — see
  [_steering.md](_steering.md).
