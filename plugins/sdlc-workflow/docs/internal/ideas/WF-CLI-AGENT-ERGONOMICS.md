# How agents use wf.mjs, and what makes it easier

This note covers the first sessions that ran v10 on real projects, and the live probes of Codex and pi. It counts how agents used `wf.mjs`, where they failed, and what changed in the CLI. It also weighs a loaded tool for `wf.mjs` against the shell command.

## What the sessions showed

About 480 shell calls ran `wf.mjs`, with about 750 command uses. Agents used the record, decision, step and progress commands most. Main sessions record the decisions, and stage agents record the steps and the progress. Nobody used `msg`, `lease claim`, `records`, `design` or `consent`.

The failures fall into eight classes:

| Class | Size | Cause |
|---|---|---|
| Usage probes | 26 calls, and about 29 reads of the plugin source | No help for one command: `--help` printed only the list of verbs. One reference named `profile record` without its arguments. |
| Git Bash path conversion | 16 stored values were wrong, and 3 were repaired | Git Bash turns an argument `/wf ...` into `C:/Program Files/Git/wf ...`. `record set` undid this, but `--resume`, `--reason` and the yolo-watch flags did not. |
| Wrong words | 4 of 4 implement agents on Codex and pi; several `decide add` retries | `progress set --status complete` (the run word is `done`); a missing `--key`; a refused enum value with no list of the allowed values. |
| Order of arguments | 2 calls | The slug in the place of the root. |
| Record names | 5 calls | A name without `.md`, or a name that is not a record. |
| A crash | 1 call; 67 calls had the same pipe | `record get ... \| head` threw an EPIPE stack trace. |
| Shell quoting | 11 heredocs | Agents built drafts with Bash heredocs instead of the file-write tool. |
| Files outside the store | 6 answer-log appends, 1 steer append, input files in the workflow folder | Old habits: `po-answers.md` and `steer.md` by hand, next to `decide add`. |

Agents also did some jobs by hand, again and again:
- They timed the test suites for `profile record`.
- They checked the stop-request file by path, with 37 failed reads of a file that did not exist.
- They edited a record body with `record get > .draft/x.md`, a sed or python patch, and `record put`.
- They recorded a batch of answers with their own script.

## A linked project lost files

A linked project keeps its records in the records repo clone. The resolver sends `wf.mjs` there, but many writers used the local path `.ai/workflows/<slug>/...`: 82 reference files, the driver prompts, test runners and shell redirects. Those files stayed on the local machine. The driver had the same split: agents wrote the journal to the local folder, and the watch read the clone, so a linked run looked dead and a stop request never arrived.

## What changed

**The records of a linked project:**
- `recordPathOf` and `realPathOf` (lib/records-root.mjs) map a local workflow path to its real place. Drafts, the answer log and dot entries stay local.
- Each records commit and each sync first moves the local files of a workflow into the clone (`adoptLocal`). A file of the same bytes is deleted. When the two copies differ, the newer one wins, and an older local file stays and is reported. The link also moves `INDEX.md`.
- The pre-write check refuses a write by the local path, and names the real place.
- The dispatch prints `records-dir:`, and the brief and the subagent context name the folder.
- `wf.mjs path <root> <slug> <file>` prints the real place of one file.

**The drivers:**
- An agent appends a journal line with `yolo-watch line <root> <slug> '<json>'`. A local journal path of an old driver maps to the clone.
- `yolo-watch stop-check <root> <slug>` evaluates the stop request in code. The agent no longer reads the control file and the journal by path.
- The staging step returns `recordsRoot`, and `wf.mjs drive` passes it on.
- `found.json` is written in `.draft/`.

**The command line:**
- `wf.mjs help [<command>]` and `<command> --help` print the forms, taken from the header of `wf.mjs`, so the help stays in line with the code.
- Every flag value undoes the Git Bash path conversion (lib/msys.mjs), in `wf.mjs` and in `yolo-watch`.
- `progress set --status complete` means `done`.
- A record name can leave out `.md`. A missing record lists the records of the workflow.
- `record draft` writes a record as its draft, ready for an edit and a put.
- `decide add --file` records a list of answers in one call, and settles each open question.
- `profile run <suite>` runs the suite, times it and records the time.
- A refused enum value names the allowed values.
- An argument error points to `help`. A slug in the place of the root says so.
- A closed pipe ends the command without a stack trace.

## Still open

- A command to drop or move a slice. Agents wrote their own scripts, and the slice status has no `dropped` value.
- A way to read several records in one call.
- A command for the test receipt of implement, which agents still write by hand.
- The answer log `po-answers.md`. A shell append bypasses the write check, so only the references stop it.

## A loaded tool for wf.mjs

A loaded tool means a typed tool that the host shows to the agent, through an MCP server or a native pi tool, in place of a shell command.

**What it would fix.** A typed call has no shell, so it has no quoting failure, no Git Bash path conversion and no PowerShell `$` expansion. Enum parameters make a wrong word impossible, and the tool list makes each command easy to find.

**What it would cost:**
- Each host needs its own wiring: an MCP server for Claude Code, an MCP entry in the Codex configuration, and a native tool in the pi extension.
- The tool schemas take context in every session. One tool with a command enum and an argument list keeps this small, but it gives up most of the typing.
- Agents in a Workflow run reach MCP tools only through a deferred tool search, which adds a step to each agent.
- The driver prompts give exact shell commands that work the same on all three hosts. A tool would need a prompt form per host.

**Assessment.** Most of the failures above came from discoverability, words, argument order and the path conversion. The CLI changes fix these classes at a small cost. Only shell quoting is left that a tool alone fixes, and the file-write tool already avoids it for drafts. So the shell command stays the contract for now. The next live runs should count help probes, failed calls and repaired values. If shell failures stay frequent after that, add one `wf` tool for main sessions (an MCP server on Claude Code and a native tool on pi). That tool would take the command and its arguments as a list, with no shell. The drivers would keep the shell commands.
