# The placement of an issue (single source)

An issue that a run finds goes to the lowest place that can take it. A new slice is near the top of the ladder, not the first answer: most issues belong to a stage or a slice that is already there. Code chooses the rung (`lib/issue-place.mjs`). No agent chooses it, and no agent edits the roster for an issue.

`<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

## The flow

1. A stage agent posts the issue: `<wf> talk post "<projectRoot>" <slug> --as <stage>:<slice> --issue --text "<what fails, and the command that shows it>" --refs <file:line,commit>`. It does not fix it. A second post of the same issue, with the same refs, joins the open thread. A red that the slice's own change causes, in any test, is not an issue: it is inside the criteria of the slice, and the slice fixes it before it ends.
2. The driver (yolo) or the lead (orchestrate) starts a read-only investigation, which writes `05i-issue-<key>.md` ([_issue-investigate.md](_issue-investigate.md)). It runs alongside the next slice.
3. At the next boundary between slices, the driver runs `<wf> issue place "<projectRoot>" <slug> <id> --apply`. The command reads the investigation and the state of the slices, chooses the rung, writes `placement` into the record, does what the rung says, and posts a `placed:` line in the thread.

On Claude the same calls are MCP tools: `wf_run { "op": "talk post", "issue": true, … }`, `wf_read { "issues": true }`, `wf_run { "op": "issue place", "apply": true, … }`.

## The ladder

| Rung | Place | When | What the command does |
|---|---|---|---|
| 1 | the stage of the owner slice that runs now | the cause is inside its acceptance criteria | a talk request to that stage |
| 2 | the next stage of the owner slice | the same, and its next stage has not started | a talk request it reads when it starts |
| 3 | the next slice that has not started | its scope covers the issue, and its plan has room under the step limit (`slices.maxSteps`, default 20) | `slice carry`: the issue goes into its record, its plan is written again |
| 4 | a later slice that has not started | the same | `slice carry` |
| 4b | the slug-wide review | no open slice is left, and the review has not run | a talk request to the review |
| 5 | a new slice | the proof gate holds | `slice add` from the proposal of the investigation |
| 6 | the next packet of the campaign | its scope covers the issue | the issue goes to `work/<packet>.issues.json` |
| 7 | the person | nothing below holds | a held question |

**The proof gate of rung 5.** The cause is reproduced, the reproduction command is in the record, no open slice covers the issue with room to spare, each open slice that does not cover it says why, and the investigation proposes the slice with its scope and its criteria. A slice added this way runs after the owner slice, and the run drives it.

**Out of scope.** An issue outside the confirmed scope of the workflow is never placed. It is a held question to the person, whatever the rung would be. The run builds the other slices while it waits.

## Delivery that fails

A stage that is given an issue and cannot take it replies `cannot: <why>` in the thread. The next `issue place` places the issue one rung higher. A delivery to a stage that ended without closing the thread is placed again the same way.

## Held questions

The question is `issue-<key>` in the decisions. The options are "Add a slice in this workflow", "Leave it to a later packet or workflow", and "Park it". When the person answers, the next `issue place` applies the answer: a slice from the proposal, the next packet, or a closed thread.

## Once only

A placement that was applied is not applied again. `issue place` prints `already`. `slice add` and `slice carry` take the record of the placement (`--placement 05i-issue-<key>.md`) or a decision of the person (`--by person --decision <id>`), and the same one twice changes nothing.
