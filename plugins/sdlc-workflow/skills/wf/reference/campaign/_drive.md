# Campaign drive: the resolve agent

The wave driver (`workflows/campaign-wave.js`) drives every unit of one wave in one Workflow run. Its prompts are the specification of its agents: each prompt gives its commands in full, with absolute paths. This file holds only the part that the resolve agent reads, and that the campaign session reads to know what an answer does. The park kinds, their causes, and their away answers are in [_waves.md](_waves.md), "Questions while the run goes". The order procedure is in [_order.md](_order.md). The boundary agents follow [_boundary.md](_boundary.md).

`<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. The prompt gives each command in full.

- Each `<cmd>` command prints one JSON object. Return the fields that the prompt names, as the command printed them.
- CAUTION: do not edit `ledger.json` by hand. Change the ledger only through `<cmd>`, because each command holds the ledger lock. A hand edit can overwrite the change of another agent.

## Resume actions

When the answer has `move`, the unit moves out of the wave, and no resolve agent runs. For the kinds `contract`, `needs-cycle`, `deadlock`, and `moved-dependency`, a resolve agent reads the answer and follows the part of its kind, below.

1. Run only the commands that the answer asks for.
2. Record every wait that the answer gives with `needs add --by person`, also when the action is `replan`. The driver adds a wait only from a `needs add` result, so the driver and the ledger hold the same waits.
3. Return `action` (`continue`, `replan`, or `move`), `dropped`, `added`, and `amended`.
4. As your last command, run `<cmd> question <id> consumed`, except for `action: replan`. A replan passes the answer to the plan, and the plan marks it consumed.

### contract

The prompt gives the shared pair in its context: the slice, the other unit, and the files.

- When the answer approves the change, run `<cmd> contract <key> amend --line <line key> --text "<new text>"`, with the key that the prompt gives. Return `action: continue` and `amended: true`.
- When the answer refuses the change, run no command. Return `action: replan`. The plan of the slice then runs again with the answer.
- When the answer keeps the contract and lets the slice wait for the other unit, run `<cmd> needs <key> add --from <key> --through <slice> --before <slice> --why "<text>" --by person`. Return it in `added`, with the `state` and `sha` of its `wait`, and return `action: continue`.
- When the answer moves the unit out of the wave, return `action: move`.

`contract amend` writes the context file of every unit that carries or expects the line. Each stage agent reads its context file fresh, so the change reaches the other units at their next agent.

### needs-cycle

- When the answer names the slice order, run `<cmd> needs <key> add --from <key> --through <slice> --before <slice> --why "<text>" --by person` for the entry that the answer gives. Return it in `added`, with the `state` and `sha` of the `wait` that the command printed. Return `action: continue`.
- When the answer moves the unit out of the wave, return `action: move`.

### deadlock

- When the answer drops a derived entry, run `<cmd> needs <key> remove --from <key> --through <slice> --before <slice>`. Return the entry in `dropped`, and return `action: continue`. The command leaves a drop record, so a relaunch does not add the wait again.
- `needs remove` drops only a derived entry. When the answer names a wait of a packet, run no command for that wait, and say so in `note`.
- When the answer moves the unit out of the wave, return `action: move`.

A wait that the answer does not drop stays open, and the unit waits again.

### moved-dependency

- When the answer drops the wait, and the wait is a derived entry, run `<cmd> needs <key> remove` for it. Return the wait in `dropped`, and return `action: continue`. The unit continues without the wait.
- When the answer moves the unit out too, return `action: move`.
