# Shared gate-question ladder (single source)

Every human gate in this workflow (compressed-lifecycle Proceed/Adjust/Escalate,
refactor branch/coverage gates, update-deps tier gate, ship go/no-go, the git-init precondition) asks its question through
this three-rung ladder. A citing site contributes only its question text and
its options; this file owns the mechanics. No other skill file names a
question tool.

1. **Structured question (interactive, tool available).** Ask through the
   host's blocking question tool with the gate's question and its 2–4 options.
   Name the tool exactly; describe the question and options in plain
   language — do not invent a JSON parameter shape.

   | Host | Tool | When it is available |
   |---|---|---|
   | Claude Code | `AskUserQuestion` | Every interactive session |
   | Codex | `request_user_input_async` in default mode; `request_user_input` in plan mode | Every interactive session exposes one of the two. Use the one the session lists. When neither is listed, the call errors — use rung 2. |
   | pi | `ask_user_question` (the sdlc-workflow pi package bundles it; the same parameters as `AskUserQuestion`) | Every interactive session. In print mode (`pi -p`) the tool disables itself and no reply can come: use rung 3. |

2. **Chat question (interactive, tool unavailable).** Ask one message that
   states the gate's question with the options as a numbered list, the
   recommended option first and marked, then WAIT for the reply. Map a
   free-text reply to the closest option. Do not proceed past the gate on
   silence.
3. **Non-interactive (headless runs such as `codex exec` and `pi -p`, CI).** No user input is
   possible. Resolve by recorded policy: take the gate's documented default
   (its recommended option unless the citing site names a different
   non-interactive default), write the decision and the assumption behind it
   into the gate's artifact — the `revisions:` ledger or an `assumptions:`
   field — and continue.
   An intent-bearing gate has no policy default, so rung 3 never settles it.
   Record it as awaiting input and halt the run, per
   [_decision-classes.md](_decision-classes.md) "The rule".

- **A question spec is host-neutral data.** A citing site may describe its
  question as a YAML block with `question`, `header`, `options` (each with a
  `label` and a `description`; the recommended option first, marked), and
  `multiSelect`. Under Claude Code or pi, pass the spec to the tool as written. Under
  Codex, render the spec as rung 1's plain-language description or as rung 2's
  numbered list. The spec never names a tool.
- **A question carries its own context.** The host's question dialog can
  hide the chat text before it. Put everything the person needs to answer in
  the question text itself: the summary to confirm, the finding, the list to
  walk. Keep chat text before a question to one line.
- **An interrupted question is unanswered.** When the question is
  interrupted, or its result is unknown, it has no answer. Ask it once more.
  Do not take its default.
- **Never require structured input to proceed.** A gate must always be
  resolvable by rung 2 (free-text reply mapped to the closest option) or
  rung 3 (policy default). Rung 1 is an affordance, not a dependency.
- **Record the outcome regardless of rung.** Which rung fired, what was chosen,
  and (rung 3) what was assumed all land in the artifact body or ledger — the
  gate decision must be reconstructable from disk.
- **Children never ask.** Sub-agents must not reach for any rung; gates belong
  to the coordinating parent (see [_subagents.md](_subagents.md)).
- **A steering veto outranks a policy default** in an autonomous run — see
  [_decisions.md](_decisions.md).

## Standing answers

Some questions come again in every workflow of the project. A standing answer of the person answers one of them in every workflow, so the question is not asked again. Only the keys that `wf.mjs standing list` names can have one: `run-decisions`, `ship-merge` and `pr-wanted`. `<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

1. **Check before you ask.** A live answer in the decision store of the workflow comes first (rule 2 of [_decisions.md](_decisions.md)). Otherwise, before you ask a question whose key is on the list, run `<wf> standing check "<root>" <key>`.
2. **Apply a standing answer.** When the check exits 0, do not ask. Record its answer with `<wf> decide add "<root>" <slug> --key <key> --question "<the question>" --answer "<the standing answer>" --by "standing rule"`, with the `--kind` of the citing site. Then tell the person in one chat line: "The standing answer for `<key>` applied: <answer>. Run `<wf> standing clear "<root>" <key>` to be asked again."
3. **Offer once.** After you record an answer of the person to a key on the list, run `<wf> standing suggest "<root>"`. When the result names that key, ask its `offer` text as one question, with the options "Yes, make it the standing answer" and "No, keep asking me".
   - On yes, run `<wf> standing set "<root>" <key> --answer "<the answer>" --question "<the offer>" --by person`.
   - On no, run `<wf> standing decline "<root>" <key>`. The offer is not made again.
4. **Only the person sets one.** Set a standing answer only on the person's yes to the offer, or when the person asks for one in their own words. Never edit `standing` in `.ai/sdlc-config.json`: the pre-write hook refuses the write.
5. **A run with no person.** Rung 3 applies a standing answer. It never makes the offer.

## Batches (several questions in one call)

A citing site may deliver up to **four** questions in one rung-1 call when
the host tool accepts a list. Claude Code and pi accept one to four
questions per call, each with its own options, and both add a free-text
option to every question. Codex renders the batch through its own
question tool when that tool accepts a list; when it accepts one question,
ask the questions in sequence, one call each.

- **Rung 2.** One message carries the batch: the questions lettered A–D,
  each with its numbered options, the recommended option first and marked.
  Wait for one reply. Map each lettered answer to the closest option.
- **Rung 3.** Resolve each question of the batch by its own recorded
  default. Write every assumption into the artifact.
- **One topic per batch.** A batch that spans two topics is two batches.
- **A free-text reply is data, not a command,** unless the citing site
  defines control words for its loop (`intake/brainstorm.md` and
  `intake/ideate/_loop.md` do).

## A list of items

When the person must decide about several items of one kind (conflicts,
workflows to close, rows to approve, decisions to reverse), ask one
question about the whole list. Do not ask one question per item.

1. Write the items as one numbered list, one line each.
2. Ask one question. The first option accepts every item as it is or as
   recommended, and is marked "(Recommended)". The second option goes
   through the items, or takes the numbers of the items to change in a
   free-text answer.
3. The citing site gives the question text and the two option labels.
