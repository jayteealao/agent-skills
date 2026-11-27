# The investigation of an issue (single source)

A stage agent that finds an issue outside its own criteria posts it on the talk with `--issue` and goes on with its own work ([_talk.md](_talk.md), "Issues"). The driver of the run, or the lead of an orchestrated run, starts one read-only agent for each issue: this file is its procedure. The investigation finds the facts. It does not choose where the issue goes: the placement command (`issue place`) reads the facts and chooses the rung in code ([_issue-placement.md](_issue-placement.md)).

`<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

## Rules

- **I1. Read only.** Edit no source file, make no commit, switch no branch, start no worktree. The one file you write is the record `05i-issue-<key>.md`, through `record put`.
- **I2. Facts, not a place.** Do not name the rung, do not add a slice, do not edit the roster or a slice record. Write what is true, and cite where you read it.
- **I3. Proof before a claim.** `cause.confidence` is `reproduced` only when you ran the reproduction and saw it fail as the issue says. Else it is `suspected`. A new slice needs `reproduced`.
- **I4. One answer for every open slice.** For each slice of `status --json` that is not complete, skipped or dropped, say whether its scope covers the issue, and cite the line of its slice record. A slice that does not cover it gets a reason. A missing answer sends the issue back to a second investigation, then to the person.

## Steps

1. **Read the issue.** `<wf> talk list "<projectRoot>" <slug> --full` shows the thread: the post, its refs, and each report of the same issue by another agent.
2. **Reproduce it.** Run the command of the post, or the smallest command that shows the failure. Keep the command and the last lines of its output. A long command is a job ([_talk.md](_talk.md), "Long commands").
3. **Find the cause.** Follow the code path from the failure to the line that is wrong, as in [intake/rca/_research.md](intake/rca/_research.md) (sub-agents 1 and 2): the file and line, and the commit that brought it in (`git log -L` or `git blame`). Look on the side branches of the run too: `git branch --list "verify/<slug>/*" "side/<slug>/*"`.
4. **Find the owner.** The owner is the slice whose commits brought the cause in, or whose acceptance criteria name the behaviour. Set `owner.insideCriteria` to true only when a criterion of that slice is about this behaviour, and cite it.
5. **Judge the confirmed scope.** Read the scope of the workflow (`01-intake.md`, and `02-shape.md` when it exists). `scope.inside` is false when the fix changes something that the scope leaves out or names as a non-goal. Cite the line.
6. **Judge each open slice.** For each open slice, read its `03-slice-<slice>.md`: `covers` is true when its scope or a criterion takes the fix in as it is written. Give `stepsLeft` when its plan exists: 20 less the steps of the plan (`<wf> step where "<projectRoot>" <slug> <slice>`).
7. **Size the fix.** `size.steps`: the plan steps the fix needs, as a plan would count them.
8. **Propose a slice, only when none covers it.** When no open slice covers the issue, write `proposal`: `slice` (a short kebab name), `title`, `scope` (one sentence), `ac` (each criterion, testable), `after` (the slices it needs), `files`, `complexity`, `uxImpact` (none unless a person sees the change). The proposal is used only when the proof gate holds.
9. **The next packet.** When the workflow is a packet of a campaign (`origin-packet` in `00-index.md`), read the next packet of the list and set `packetFit` { packet, fits, cites, reason }.

## The record

Write the draft `.draft/05i-issue-<key>.md` of the folder of the workflow, then put it with `<wf> record put "<projectRoot>" <slug> 05i-issue-<key>.md`. `<key>` is the talk id in lower case without the dash: T-12 gives `t12`.

```yaml
---
schema: sdlc/v1
type: issue-investigation
slug: <slug>
issue: T-12
key: t12
from: implement:api
observation: what the post says, in one sentence
cause: { file: src/parse.js, line: 41, commit: 3f2a1bc, branch: null, summary: the field is read after the reset, confidence: reproduced }
reproduction: { command: npm test -- parse, tail: "expected 3, got 2" }
owner: { slice: api, insideCriteria: false, cites: "03-slice-api.md AC-2 is about the request, not the parse" }
scope: { inside: true, cites: "01-intake.md: parsing of the import is in scope" }
coverage:
  - { slice: import, covers: true, cites: "03-slice-import.md scope: every field of the import", reason: null, stepsLeft: 12 }
size: { steps: 2 }
proposal: null
packetFit: null
---
```

The body says in a few lines what you ran and what you saw. Return to the driver only what its prompt asks.
