# The vision contract (single source)

The vision contract of a `/wf orchestrate` run is the list of outcomes that the person approved. It is the only definition of done. [../orchestrate.md](../orchestrate.md) cites this file for the format of the contract file, the kinds of outcome, and the standing outcomes.

## The contract file

The lead writes one JSON file, and `orchestrate.mjs contract put` reads it:

```json
{
  "source": { "kind": "instruction" },
  "commands": { "tests": "npm test", "rules": "npm run lint", "ci": "" },
  "outcomes": [
    {
      "id": "OUT-AUTH-001",
      "says": "A person with a correct password reaches the home screen.",
      "kind": "behaviour",
      "proof": { "surface": "the sign-in screen", "evidence": "a screen of the home screen after the sign-in" },
      "needs": [],
      "source": "D-12",
      "area": "Sign-in"
    }
  ]
}
```

| Field | Content |
|---|---|
| `source.kind` | `instruction`, `intake` or `list`. A list also has `slug` (the source workflow) and `list-revision`; `take-over` prints both. |
| `commands.tests` | The command that builds and tests the repo. Write `none` when the repo has no tests. |
| `commands.rules` | The command that checks the written rules of the project (a lint, a design system check). Leave it empty when there is none: on the full path the code validator then judges the rules. |
| `commands.ci` | Leave it empty for the checks of the PR. Write `none` when the repo has no CI. |
| `id` | `OUT-<AREA>-<n>` in capitals. It never changes. |
| `says` | One sentence, in the person's words where possible: what is true when the outcome is met. Write what a person can see or measure, not how it is built. |
| `kind`, `proof` | See the kinds below. |
| `needs` | The ids of the outcomes that must pass first. |
| `source` | Where the outcome comes from: the id of an answer of the interview, an acceptance criterion of a work packet, or a carried decision. |
| `packet` | The key of the work packet, for a contract from a list. |
| `area` | The area that the approval shows the outcome under. |

Do not write `state`. An outcome of a list contract keeps `"state": "passed"` only when `take-over` gave it: its work packet is done.

## The kinds

| Kind | For | The proof names | Judged by |
|---|---|---|---|
| `behaviour` | Something that a user does and sees | `surface`: the screen, the command or the endpoint to drive. `evidence`: what to capture. | The product validator, with the scenarios |
| `measure` | Something that a command can measure | `command`: one command that exits 0 when the outcome holds. `expect` (optional): a text that its output must contain. | The measure judge, a script |
| `design` | How something looks or feels | `record`: the key of the design record. `screens`: the screens to compare. The match checklist is added by `contract design` when the person approves the design. | The product validator, against the checklist |
| `artifact` | Work with no product to observe | `deliverable`: the path of the file. `must-answer`: the questions that the file must answer, in the person's words. `sources`: what counts as a source for a claim. | The artifact validator |

Choose the kind by what can prove the outcome. Prefer `measure` when one command can decide: a script does not talk itself into a pass. Use `behaviour` for what a person does and sees. Use `design` only for taste, and `artifact` only when no product can be observed.

A contract can mix kinds. "Find why the save is slow, then make it under 2 seconds" is one `artifact` outcome and one `measure` outcome, and the second names the first in `needs`.

## The states

| State | Meaning | Who gives it |
|---|---|---|
| `open` | Not proved yet | The start, a confirmed failure, a rewrite, an answer to a held question |
| `passed` | A validator result says pass at the current commit | The script, from a validator result |
| `held` | A contract question waits for the person | `hold`, or the script after 3 confirmed failed rounds |
| `unproven` | The work is built, and this machine cannot produce the evidence | `unproven`, with the command and the output of the probe |
| `dropped` | The person took the outcome out | The person, through a contract change or an answer |

## The `artifact` outcome

Some instructions give no product to observe: an investigation, a comparison, an audit, a document. The result is a file.

- The author writes the deliverable, and beside it a claims file `<deliverable>.claims.json`: `{ "claims": [{ "claim", "source" }] }`. A source is a file and a line of the repo, a command with its output, or a URL. Each claim of fact of the deliverable is in the claims file.
- The artifact validator does not read the hand-off of the author. It opens each file, runs each command again, and reads each page. A claim with no source, or a source that does not say what the claim says, is a failure. Then it judges each `must-answer` question: answered with support, answered with no support, or not answered.
- The outcome passes only when each question is answered with support and no claim fails.
- A checked claim shows that the deliverable is honest about its sources. It does not show that the conclusion is right. The evidence page marks the outcome "judged, not observed".
- A deliverable can recommend. No unit acts on the recommendation unless another outcome of the contract says so. The person picks.

## The standing outcomes

The interview covers what the person said. The standing outcomes cover what the person did not say. The script adds them at the approval. The lead does not write them.

| Id | Says | Judged by |
|---|---|---|
| `OUT-STAND-TESTS` | The build and the test suite of the repo pass. | The measure judge, with `commands.tests` |
| `OUT-STAND-CHARTER` | Each charter commitment and each live steer holds in the running product. | The product validator, each milestone |
| `OUT-STAND-RULES` | The rules of the instruction files of the repo hold, and the design system check passes where the repo has one. | The measure judge, with `commands.rules`; with no command, the code validator: a finding with `"rule": true` fails the outcome |
| `OUT-STAND-REST` | The main paths of the product that the contract does not name work as before the run. | The product validator: the first milestone records the paths, and the end proof walks them again |
| `OUT-STAND-CI` | CI passes on the PR of the run. | The measure judge, after each push |

A light-path contract gets `OUT-STAND-TESTS` and `OUT-STAND-CI`, and `OUT-STAND-RULES` when `commands.rules` names a command.

## The size

After the approval, the script sizes the contract. It is `light` when it has at most 2 outcomes that are not standing, none of kind `design`, and the lead says with a reason that one builder can do the work in one unit. Any other contract is `full`. The word of the person, "full" or "light", outranks the check. A contract can move up to the full path, and never down.
