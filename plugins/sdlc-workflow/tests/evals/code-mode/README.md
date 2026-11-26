# The code-mode eval

This eval measures how an agent works with the records of a workflow, in two arms:

- **cli**: the `wf.mjs` command line with its flag forms.
- **mcp**: the plugin is loaded, so the ten wf tools and the hooks run as they do for a user. Code with the library of `lib/wf-api.mjs` runs in `wf_query` and `wf_run`. This arm runs on Claude only; Codex and pi run the cli arm.

The eval is not part of `npm test`. `tests/unit/eval-measures.test.mjs` checks its measures and its rule.

## Files

| File | What it does |
|---|---|
| `fixture.mjs` | Makes a git repo with one workflow of six slices, five open questions, a stopped run, a brainstorm board, ten open findings and a fast test suite. |
| `tasks.mjs` | The fourteen tasks, each with a check of the end state or of the final answer. Two tasks are controls. |
| `selftest.mjs` | Solves each task with the CLI or with code mode, and checks the result. It starts no model. |
| `run.mjs` | Runs the tasks on the hosts and saves each transcript and one result row. |
| `measure.mjs` | Reads the calls, the invalid calls, the tokens, the writes around `wf.mjs` and the final answer from a transcript. On Claude also the calls of wf by tool and by shell, the calls with code, and the denied calls. |
| `report.mjs` | Prints the table of each cell and arm, and the rule for each Claude cell. |
| `live-counts.mjs` | Counts the real calls of wf in the Claude transcripts of this computer: by tool or by shell, for the main session and for agents. |

## The tasks

The eight first tasks come from the friction classes of the agents. The six later ones are three record reads, a read of ten findings, a loop of four steps, a held question, a suite run and a bulk update of findings. The batch tasks of the rule are `three-slices`, `five-answers`, `board-group`, `ten-findings`, `steps-loop` and `bulk-findings`.

## The rule

The wf tools pass in a Claude cell when all of these hold:

- No task passes less often in the mcp arm than in the cli arm.
- The tokens of the control tasks rise by at most 10%.
- The calls of the batch tasks fall by at least 30%.
- The wf tools make at least 95% of the calls of wf in the mcp arm, and no call of wf is denied.

`wf_person` asks the person, and `claude -p` denies such a call. A task that records an answer by the person (`five-answers`, `one-decision`) shows whether an agent falls back to another way, and how.

## Check the harness

```bash
node tests/evals/code-mode/selftest.mjs
```

Every task must fail on the fresh fixture and pass after its known solution.

## Run the eval

WARNING: `run.mjs --yes` starts `claude -p`, `codex exec` or pi for each run. Each run spends the usage limits of its host. Get the yes of the person for the cells and the number of runs first.

1. Print the list of runs. This starts nothing.

   ```bash
   node tests/evals/code-mode/run.mjs --cells claude-sonnet-pwsh,claude-sonnet-sub --runs 5
   ```

2. After the yes of the person, run the same command with `--yes`.
3. Print the report.

   ```bash
   node tests/evals/code-mode/report.mjs
   ```

The results go to `.scratch/evals/code-mode/` of the plugin. The pi command line in `run.mjs` and the pi event names in `measure.mjs` are not checked against a pi transcript yet. Check them before a pi run.

## Live counts

```bash
node tests/evals/code-mode/live-counts.mjs --since 2026-11-19 --until 2026-11-26
```

It reads `~/.claude/projects` (or `--dir`) and writes nothing. A transcript last written before `--since` is skipped. Run it for a week before a change and a week after it, with the same parser.
