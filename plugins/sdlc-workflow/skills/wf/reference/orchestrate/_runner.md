# Agents, tiers and the runner (single source)

A `/wf orchestrate` run uses agents of more than one vendor. [../orchestrate.md](../orchestrate.md) cites this file for who chooses a model, the tiers, the roster, and how an agent that is not a subagent of the lead's host is launched and supervised.

## Who chooses

- **The person chooses the lead.** The model of the lead is the model of the session. The plugin never changes it.
- **The person says which agents the run may use.** The lead asks once, with the roster, and records the answer with `orchestrate.mjs agents allow`.
- **The lead chooses among them.** For each role, pick an allowed agent that meets the tier of the role. Record the pick and its reason with `decide add --by delegate`.
- **The script refuses** a Fable-class or Mythos-class model for any agent, a model below the tier of the role, a model that has no tier, and a model that only judges in a role that builds.

## The tiers and the roles

A tier is a capability level, not a model name.

| Tier | Meaning |
|---|---|
| A | The strongest model of a vendor that the person allows, at high effort |
| B | The standard coding model of a vendor |
| C | A small, fast model. No role yet. |

| Role | Lowest tier | Note |
|---|---|---|
| `scenario` | A | Writes the hidden scenarios |
| `product-validator` | A | From another vendor than the builders, when the roster allows it |
| `artifact-validator` | A | From another vendor than the author, when the roster allows it |
| `design` | A | |
| `builder-hard` | A | A unit that the lead marks hard. Never a model that only judges |
| `builder`, `author` | B | |
| `code-validator` | B | |
| `readiness` | B | |

- A role may take a higher tier, never a lower one.
- **Another vendor for a validator is preferred, not required.** A model is lenient to its own output. With one vendor only, the run still starts, and the hand-back says so.
- The measure judge is a script and has no tier.

## The roster

`orchestrate.mjs roster <root> <slug> --host <host>` prints `hc` (whether herdr core is installed), the agent programs that run on this machine, and one entry for each agent:

| `launch` | The agent | Started by |
|---|---|---|
| `host-subagent` | A subagent of the lead's own host, on the model that `alias` names | The lead, with the subagent tool of its host |
| `hc` | An agent program in a terminal of `hc` | `orchestrate.mjs dispatch` |
| `direct` | An agent program, run once, when the machine has no `hc` | `orchestrate.mjs dispatch`; the command returns when the agent ends |

The tier of each model is data: [tiers.json](tiers.json). A model that is not in it has no tier. Only the person adds a model. A file `orchestrate-tiers.json` in the machine folder of the plugin replaces the models that it names.

## Agents under `hc`

`hc` runs an agent program in a terminal that stays alive. `hc --skill` prints its manual. The script follows these rules of the manual, and the lead does not call `hc` itself for a unit:

- An agent runs in its interactive mode and in the background, so the person can attach to it and watch.
- Each agent writes inside the checkout with no prompt. The script never starts an agent with full access. How strong the limit is depends on the program: one keeps the agent in a sandbox, one judges each action itself, and one has no limit of its own. For a unit that must not write outside the checkout, pick an agent whose program has a sandbox.
- Some agent programs cannot write to the `.git` folder under this permission, so their agent cannot commit. Such a builder leaves the change in the working tree and lists its files, and `orchestrate.mjs result` commits those paths.
- A terminal carries the label `wf.run=<slug>`. It outlives the lead: when the lead stops, the agent finishes its unit and writes its result file.
- The lead does not need a terminal of `hc`. Inside one, the lead is the parent of its agents and gets their reports. Outside one, the script waits on each agent by its name. The result is a file in both cases.

## Supervise an agent

`orchestrate.mjs wait <root> <slug> <n>` waits for the agent of a unit and prints its status:

| Status | Do |
|---|---|
| `working` | A check-in, not a failure. Wait again. Never sleep and poll. |
| `done`, `idle` or `exited`, with a result file | Run the `result` command that it prints. |
| `done` or `idle`, with no result file | Read the screen (`screen`). Send one line that asks for the result file (`send`). |
| `exited`, `gone` or `error`, with no result file | Read the screen that it prints. On a usage limit, see below. Else run `result` with no file: the unit failed, and a new unit goes to another agent. |
| `starting` | The agent has not started its task. Read the screen that it prints. A start dialog of the program about this checkout, such as a question to trust the folder, is answered with `orchestrate.mjs keys <root> <slug> <n> enter`. Any other dialog: end the agent. With no dialog, wait again. |
| `blocked` | The agent asks a person. Read the screen that it prints, and decide by the rule below. |

**A blocked agent.**

- A plain question that the contract or the decision store answers: answer it with `orchestrate.mjs send <root> <slug> <n> --text "<the answer>"`, and record the answer with `decide add --by delegate`.
- A permission prompt: never pass it. End the agent with `orchestrate.mjs end <root> <slug> <n> --abandon`, and run `result` with no file. Then decide whether the unit needs another shape that does not need the permission.
- A question about the contract: hold the outcome as a contract question, and end the agent.

**A usage limit.** When an agent stops on a usage limit of its subscription, add a new unit for the rest of the work, and give it to an agent of the same tier from another vendor, with the hand-off notes and the commits so far. When no such agent is free, wait for the reset. Tell the person in one chat line. Do not stop the run.

**The end of a terminal.** After the result of a unit is recorded and no fix unit will continue it, run `orchestrate.mjs end <root> <slug> <n>`. It ends and removes only a terminal of this run. It refuses while the unit has no result file; `--abandon` gives the unit up. Never stop or restart the core of `hc`.

**Helpers.** An agent may use the subagent tool of its own program. To use another model it uses `hc`, with the label of the run. `orchestrate.mjs helpers <root> <slug>` lists each terminal of the run that no unit owns, and fails when one uses a model that the tier data does not allow. It cannot see a subagent of a program's own tool: for those, the rule is in each task.

## One checkout

Each agent works in the main checkout, on the branch of the run. The run makes no worktree.

- A builder stages each file by its path, and never with `git add -A`.
- Two builders run at once only when their units name file sets that do not meet. The script refuses the dispatch otherwise.
- No builder runs the full build or the full test suite while another builder writes. The measure judge runs them when no builder writes.
- A validator runs only when no builder writes: it boots the product from the checkout. The script refuses a validator while a builder runs, and a builder while a validator runs.
- Validators that need the same emulator, device, port or database run one after the other.
