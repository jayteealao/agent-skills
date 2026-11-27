# Reports about wf

A report tells the person about a fault or a gap of wf itself: the commands, the tools, the references and the drivers. It is not about the product you build. A fault of the product that you find outside your own criteria is an issue on the talk ([_issue-placement.md](_issue-placement.md)).

## When to file one

File a report, then go on with your work, when one of these happens to you:

| Kind | When |
|---|---|
| `bug` | A wf command or tool fails, refuses a call its docs allow, or does something its docs do not say. A run that stops for a reason of wf, not of the product. |
| `docs` | A reference tells you to do something that the code refuses or that no longer exists: a flag, a field, a file, a call shape. |
| `feature` | wf lacks a command or an option that the work needed, and you used a workaround. |
| `friction` | A step of wf cost time or tokens for no gain: a check that ran twice, a question that had an answer, a long wait. |

File one report for each problem, at the time you meet it. Do not stop to fix wf, and do not edit the plugin: the person decides what is built. A report that repeats an earlier one is counted as a sighting of it, so file it again when it happens again.

## How

`wf_run { "op": "report add", "slug": "<slug>", "kind": "bug", "title": "…", "body": "…", "command": "…", "error": "…" }` (CLI: `node "<skill-dir>/scripts/wf.mjs" report add "<projectRoot>" <slug> --kind bug --title "…" --body "…" --command "…" --error "…"`). The title is one line that names what is wrong or missing. The body says what you did, what happened, what you expected, and the workaround you used. `command` is the call that failed, and `error` its error text.

- Give `severity` (`high`, `medium`, `low`) when you know it: `high` when the run cannot go on or work is lost. Without it the code guesses.
- Give `area` (the op or the stage, `campaign split`, `implement`) when the title does not name it.
- Name no secret, no token and no personal data in the report. A path of the project is fine.

The result says whether the report is new or a sighting, and what the person decided of it already. A report that was built already means the wf you run may be older than the fix: say so in your summary.

## What happens to it

The code triages each report when it is filed: its area, its severity, and the earlier report it repeats. The person sees the groups in the Reports app, the highest priority first, and decides for each: `build`, `later` or `reject`. The session that builds one records its commit with `report built <id> --commit <sha>`. An agent never decides on a report: `report decide` is refused to an agent of a run.

`report list` (`wf_query { "op": "report list", "state": "build" }`) shows the groups that the person chose to build; `report show <id>` shows one with each sighting.
