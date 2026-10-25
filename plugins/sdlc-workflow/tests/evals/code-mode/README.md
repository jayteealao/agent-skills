# The code-mode eval

This eval compares two ways for an agent to change the records of a workflow:

- **cli**: the `wf.mjs` command line with its flag forms.
- **api**: the same command line, plus `wf.mjs run` with the library of `lib/wf-api.mjs`, and the reference `skills/wf/reference/_api.md`.

The eval is not part of `npm test`.

## Files

| File | What it does |
|---|---|
| `fixture.mjs` | Makes a git repo with one workflow of six slices, five open questions, a stopped run and a brainstorm board. |
| `tasks.mjs` | The eight tasks, each with a check of the end state or of the final answer. Two tasks are controls. |
| `selftest.mjs` | Solves each task with the CLI or a script and checks the result. It starts no model. |
| `run.mjs` | Runs the tasks on the hosts and saves each transcript and one result row. |
| `measure.mjs` | Reads the calls, the invalid calls, the tokens, the writes around `wf.mjs` and the final answer from a transcript. |
| `report.mjs` | Prints the table of each cell and arm, and the decision rule for each cell. |

## Check the harness

```bash
node tests/evals/code-mode/selftest.mjs
```

Every task must fail on the fresh fixture and pass after its known solution.

## Run the eval

WARNING: `run.mjs --yes` starts `claude -p`, `codex exec` or pi for each run. Each run spends the usage limits of its host. Get the yes of the person for the cells and the number of runs first.

1. Print the list of runs. This starts nothing.

   ```bash
   node tests/evals/code-mode/run.mjs --cells claude-sonnet-pwsh --runs 5
   ```

2. After the yes of the person, run the same command with `--yes`.
3. Print the report.

   ```bash
   node tests/evals/code-mode/report.mjs
   ```

The results go to `.scratch/evals/code-mode/` of the plugin. The pi command line in `run.mjs` and the pi event names in `measure.mjs` are not checked against a pi transcript yet. Check them before a pi run.
