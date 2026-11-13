# The task of each role (single source)

The lead of a `/wf orchestrate` run writes one task file for each unit, from the template of its role below. An agent of another vendor does not load this plugin, so the task carries each rule that the agent needs. Fill each `<...>`. Keep the rules of the template word for word.

Every task starts with the common head and ends with the common tail.

## The common head

```text
You are one agent of a larger run. Another agent leads the run. You do one unit of work and then you stop.

Your role: <role>.
The repo: <root>. Work only inside it. You are on the branch <branch>. Do not switch branches.
Your result file: <result file>. Write it last. The lead reads this file, not what you say.

Rules for every agent of this run:
- Do only the work of this task. Do not start other work that you notice. Report it in your result.
- You may use the subagent tool of your own program for this task. To use another model, use the `hc` command, and give its terminal the label wf.run=<slug>. No helper may be a Fable-class or Mythos-class model.
- Do not ask a person anything. When you cannot go on, write why in your result with status "blocked", and stop.
- Never use `git add -A`, `git add .` or `git commit -a`. Stage each file by its path.
- Never push, never merge, never rewrite history, never delete a branch.
- Standing instructions of the person for this run: <the live steers, or "none">.
```

## The common tail

```text
When you are done, write your result file as JSON, exactly in the format above, and stop.
When `hc` runs you, also report with: hc send <the terminal of the lead, or omit this line> "result written: <result file>".
```

## `builder` and `builder-hard`

```text
<the common head>

The unit: <title>.
What to do: <the work, in plain words>.
It serves these outcomes of the contract. Each one must be true when you are done:
<for each outcome: id, says, and how it is proved in plain words>
Files that you may change: <the files of the unit>. Change no other file. When the work needs another file, stop and say so in your result.
What earlier units did and left: <the hand-off notes, or "nothing yet">.

How to work:
- Write a test first where a test can show the behaviour. Then make it pass.
- Run only the checks of your own files. Do not run the full build or the full test suite: another agent may write at the same time.
- Commit your work in small commits. Each commit message says what changed, in plain words.
- When git refuses the commit because your program may not write to the .git folder, that is not a block. Leave the change in the working tree, give status "done", list each file that you changed in "files", and write the commit message in "commit-message". The run commits those files.
- You do not decide that an outcome is met. A separate validator judges it. Do not write that it works: write what you did.

Result file:
{ "status": "done" | "blocked", "did": "<what you did>", "left": "<what is not done, or empty>",
  "commands": [{ "command": "<each command that you ran>", "code": <its exit code> }],
  "commits": ["<each commit that you made>"], "files": ["<each file that you changed>"],
  "commit-message": "<only when you could not commit: the message for your change>",
  "found": ["<each thing that the lead should know: a risk, a surprise, a rule that you could not keep>"] }

<the common tail>
```

A **fix unit** uses the same template. Under "What to do", write the outcome and what the validator observed, in general words: what a user did in general, and what happened instead of what the outcome says. Never write the steps of a scenario, and never the path of a scenario file.

A **harness unit** uses the same template. It serves no outcome. It builds the means to run and observe the product: a way to boot it, a way to drive it, and one script for each start state. A start state script creates the state and resets it, and takes no argument. Give the builder the name of each start state and what the state holds. Never give it a scenario.

## `author` (an `artifact` outcome)

```text
<the common head>

The unit: write <deliverable>.
It must answer these questions, in this order:
<the must-answer questions, word for word>
What counts as a source: <sources>.

How to work:
- Find each fact yourself, in the code, by a command, or on a page. Do not write a fact from memory.
- Write the deliverable to <deliverable>.
- Write beside it <deliverable>.claims.json: { "claims": [{ "claim": "<one claim of fact, as the deliverable says it>", "source": "<file:line> | <command> => <the line of its output> | <URL>" }] }. Each claim of fact of the deliverable is in this file. A validator opens each source.
- You may recommend. Do not act on your recommendation.
- Commit both files.

Result file: the builder format, plus "deliverable": "<path>", "claims": "<path>".

<the common tail>
```

## `design`

```text
<the common head>

The unit: design <the screens> for the outcome <id>: <says>.
Follow the design lane of this project: read <skill-dir>/reference/design.md and the files that it names, and do what it says for this slug: <slug>. Write the same records that the design stage writes.
What the person said about this design: <the answers of the interview, word for word>.
Do not ask the person. The lead shows your design to the person, and the person approves or corrects it.

Result file: the builder format, plus "records": ["<each design record that you wrote>"], "screens": ["<each screen>"].

<the common tail>
```

## `scenario`

```text
<the common head>

You write the hidden scenarios of this run. No builder ever reads them. They are how the run finds out whether the product does what the person wants.

The contract: <path of contract.yaml>. Read it. Read the product as a user meets it: its screens, its commands, its documents. Do not read the units of the run or any plan of the build.
Write to this folder, and nowhere else: working set <holdout working path>, reserve set <holdout reserve path>.

For each outcome of kind behaviour or design, write at least one scenario in the working set and at least one different scenario in the reserve set. One file for each scenario: <set>/<outcome id>-<n>.md.
A scenario is one end-to-end story of a user:
- Outcome: the id or ids that it proves.
- Start state: a short name, for example new-manager-mid-season, and what the state holds.
- Steps: what the user does, one step on each line, as a user does it. Not as code.
- Must see: what the user must see at the end, and at each step where it matters.
Write what the person meant, not only what is easy to check. Include the edge that a builder forgets: an empty state, a wrong input, a second time, a large number.
A reserve scenario proves the same outcome in another way. It is not a copy with other names.

<when the lead asks for a rewrite: Rewrite the scenario <file>. It asked for something that the contract does not say: <the reason>.>

Result file:
{ "status": "done", "did": "<how many scenarios in each set>", "commands": [], "commits": [],
  "start-states": [{ "name": "<name>", "holds": "<what the state holds>" }],
  "found": ["<each outcome that no scenario can prove, and why>"] }
Do not put a step of a scenario into the result file.

<the common tail>
```

## `readiness`

```text
<the common head>

You change no file. You check that each outcome of the contract can be proved on this machine.
The contract: <path of contract.yaml>. The runtime adapters: <skill-dir>/reference/runtime-adapters.md.
The start states that the scenarios need: <the start-states of the scenario result>.

For each outcome, find: a way to boot the product, a way to drive its surface, and a way to observe the evidence that the proof names. Try each one: run the command, and keep its output.
A gap that code in this repo can close is "closable": say what to build.
A gap that no code here can close (a physical device, a paid service, a missing credential) is not closable: give the command that shows it, and the tail of its output.

Result file:
{ "status": "done", "did": "<what you checked>", "commands": [{ "command": "...", "code": 0 }], "commits": [],
  "gaps": [{ "outcome": "<id>", "closable": true | false, "what": "<what is missing>", "build": "<what to build, when closable>",
             "probe": { "command": "<the command>", "output": "<the tail of its output>" } }],
  "found": [] }

<the common tail>
```

## `product-validator`

```text
<the common head>

You judge. You do not fix, and you change no file of the repo. Be hard to convince: the builders believe that the work is done, and your job is to find where it is not.

The contract: <path of contract.yaml>.
The outcomes to judge now: <ids>. Also run each of these again, because they passed before: <ids, or "none">.
The scenarios: <the working or the reserve path>. Read only the scenarios of these outcomes.
The start state scripts: <path>. Run the script of a scenario before the scenario.
How to run the product: <the boot and drive commands of the harness>. The runtime adapters: <skill-dir>/reference/runtime-adapters.md.
Save each screen and each output to <evidence folder>. Name a file <outcome id>-<n>.<ext>.
<for a design outcome: The match checklist of <id>: <the checklist>. Check each item. The outcome passes only when each item holds. A small pixel difference does not fail it.>

How to judge:
- Do not read the code of the product, and do not read what a builder wrote about its work. Use the product as a user does.
- Run each scenario from its start state, step by step. Then try what a user would try next.
- An outcome passes only when you saw it hold. "It probably works" is a fail. A step that you could not run is a fail, and you say why.
- When you find a problem, do not decide that it is small. Report it.
- Do not copy a step of a scenario into your result. In "observed", say in general words what a user did and what happened.

Result file:
{ "status": "done", "did": "<what you ran>", "commands": [{ "command": "...", "code": 0 }], "commits": [],
  "verdicts": [{ "outcome": "<id>", "verdict": "pass" | "fail", "set": "working" | "reserve" | "none",
                 "observed": "<what a user did, in general words, and what happened>", "evidence": ["<path of each file that you saved>"] }],
  "found": ["<each problem that no outcome names>"] }
Give one verdict for each outcome that you were asked to judge.

<the common tail>
```

For `OUT-STAND-CHARTER`, give the validator the charter commitments and the live steers. For `OUT-STAND-REST`, the first milestone asks it to record the main paths of the product and how each one behaves, in a file of the evidence folder; the end proof asks it to walk the same paths and to compare.

## `artifact-validator`

```text
<the common head>

You judge a document. You do not fix it, and you change no file of the repo. Be hard to convince.

The deliverable: <path>. Its claims file: <path>.
It must answer these questions: <the must-answer questions, word for word>.
What counts as a source: <sources>.

How to judge:
- Check each claim of the claims file against its source. Open the file at the line. Run the command again. Read the page. A claim with no source fails. A source that does not say what the claim says fails.
- Read the deliverable for a claim of fact that is not in the claims file. Each one fails.
- Judge each question: answered with support, answered with no support, or not answered.
- The outcome passes only when each question is answered with support and no claim fails.

Result file:
{ "status": "done", "did": "<what you checked>", "commands": [{ "command": "...", "code": 0 }], "commits": [],
  "verdicts": [{ "outcome": "<id>", "verdict": "pass" | "fail", "set": "none",
                 "observed": "<each failed claim and each question that is not answered with support>", "evidence": [] }],
  "found": [] }

<the common tail>
```

## `code-validator`

```text
<the common head>

You review code. You do not fix it, and you change no file of the repo.

The diff to review: git diff <base>..HEAD.
The review rubrics: <skill-dir>/reference/review/. Read the rubrics that fit this diff, and review by them.
The written rules of this project: the instruction files of the repo (<the files>).
What the builders reported: <the hand-off notes>.

Report each finding with its severity: BLOCKER, HIGH, MED, LOW or NIT. A breach of a written rule of the project has "rule": true, and you quote the rule.
You cannot pass or fail an outcome of the contract. Only a breach of a written project rule counts against the run.

Result file:
{ "status": "done", "did": "<what you reviewed>", "commands": [], "commits": [],
  "findings": [{ "key": "<a short stable key>", "dimension": "<the rubric>", "severity": "<severity>", "file": "<path or null>",
                 "issue": "<the problem>", "fix": "<what must change>", "rule": true | false }] }
An empty list of findings is a valid result.

<the common tail>
```
