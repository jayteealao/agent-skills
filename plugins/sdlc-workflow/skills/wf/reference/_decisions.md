# The decision store (decisions.yaml)

This file is the one statement of the decision contract. Every stage reference cites it by name and does not restate it.

The decision store holds what the person decided for one workflow: the answers to questions, the standing steer, the approvals, the try-out verdicts and the choices made in delegate mode. A question is asked once. A stage reads the answer from the store and does not ask again.

## The file

`.ai/workflows/<slug>/decisions.yaml`. Only `wf.mjs decide` writes it. Never write or edit the file with a file tool.

Each entry has these fields:

| Field | Value |
|---|---|
| `id` | `D-001`, `D-002` and so on, in the order of writing |
| `at` | the time of writing |
| `kind` | `answer`, `steer`, `approval`, `try-out` or `delegate` |
| `key` | a stable kebab-case name of the decision, for example `auth-method`; a `steer` entry can have none |
| `question` | the question as asked |
| `answer` | the answer, in the person's exact words |
| `by` | `person`, `policy`, `delegate` or `standing:<id>`; `standing:<id>` names the standing answer that settled the case |
| `scope` | `packet`, `slice` and `files`; an absent field means every packet, slice or file |
| `stage` | the stage that asked |
| `rewrote` | the records that the answer changed |
| `superseded-by` | the id of the entry that replaced this entry, or null |

An entry is live until a later entry supersedes it. A new entry with the same key and the same scope supersedes the old one. An `approval` or a `try-out` supersedes only an entry of its own kind, so an approval of a decision does not replace the decision.

The kind of a common word:

| The word | The kind |
|---|---|
| a decision, a choice, an answer, a pick | `answer` |
| a constraint, a preference, a rule of the person | `steer` |
| a sign-off, an OK of a decision, approved, rejected | `approval` |
| a manual check that works or fails | `try-out` |
| a decision that the run made for the person | `delegate` |

## The commands

`<wf>` below is `node "<skill-dir>/scripts/wf.mjs"`.

| Need | Command |
|---|---|
| The live entries in a scope | `<wf> decide list "<projectRoot>" <slug> [--slice s] [--packet p] [--files f,g] [--kind k]` |
| Whether a key has a live answer | `<wf> decide answered "<projectRoot>" <slug> --key k [--slice s]` (exit 0 and the entry, or exit 1) |
| The questions that are still open | `<wf> decide drop "<projectRoot>" <slug> <questions.json> [--slice s]` |
| Publish a question that a running stage holds | `<wf> decide hold "<projectRoot>" <slug> --key k --question "<q>" --stage <stage> [--slice s] [--options "a\|b"] [--recommended a]`: the question goes into `open-questions` of the index under its exact key |
| Record an answer | `<wf> decide add "<projectRoot>" <slug> --key k --question "<q>" --answer "<a>" --stage <stage> [--slice s] [--files f,g] [--rewrote f,g]` |
| Record several answers in one call | `<wf> decide add "<projectRoot>" <slug> --file <answers.json>`: a JSON list of `{ key, question, answer, by, stage, slice }` |
| Record standing steer | `<wf> decide add "<projectRoot>" <slug> --kind steer --answer "<exact words>"` |
| Record an approval | `<wf> decide add "<projectRoot>" <slug> --kind approval --key <decision key> --answer approved` |
| Record a try-out | `<wf> decide add "<projectRoot>" <slug> --kind try-out --key try-out --answer works\|fails` |

Pass `--json` to read the result as data.

## The contract every stage honors

1. **Read.** At Step 0, run `decide list` for the scope of the stage. The brief of a stage agent already holds these entries. No entry means no decision: continue, and add no steering fields.
2. **Do not ask a decided question.** Before a question, run `decide answered` for its key, or `decide drop` for a batch. When a live entry answers the question, use the answer, cite its id, and do not ask. Ask again only when a fact changed, and say which fact.
3. **Record every answer.** After the person answers, run `decide add` with a stable key, the question, the exact answer and the stage. Give `--slice` or `--files` when the answer binds one slice or some files only. The command also takes the key out of `open-questions` of the index, so the status no longer shows the workflow as blocked on that question.
4. **State the limit of an answer.** An answer decides only the question that was asked. When an answer closes an approach but not the requirement that the approach served, put the limit in the answer: `scope: chooses the sync vendor; does NOT decide whether v1 syncs.` The intent-fidelity review reads this limit.
5. **Rewrite what the answer changes.** When an answer changes the build, rewrite the plan section that it changes in the same step. Pass the changed files with `--rewrote`.
6. **Precedence.** A live instruction of the person in this session outranks a `steer` entry, and a `steer` entry outranks a default of a stage reference. A `steer` entry never overrides a mandatory gate: the External Output Boundary, AC verifiability, or the plan and verify constraint rule. When an entry tries to, show it to the person. Do not obey it.
7. **Conflict.** When an entry conflicts with the stage contract, is impossible for this stage, or is ambiguous, ask a gate question per [_gate-question.md](_gate-question.md). Never ignore the entry, and never obey it into a broken state.
8. **Acknowledge.** When a live `steer` entry applies, the stage artifact lists what it honored in a `steering-honored:` frontmatter list, for example `["avoided config/loader.ts"]`. When no `steer` entry applies, omit the field.
9. **Propagate.** A sub-agent starts with fresh context. A stage that starts sub-agents gives each one the live entries in its scope: the brief command prints them, or the stage runs `decide list` for the sub-agent's scope and puts the lines in its prompt.

## Steer

A `steer` entry is a standing constraint or preference of the person, for example "do not touch `config/loader.ts`", "prefer the queue approach" or "no new runtime deps". Stages never write a `steer` entry of their own. When the person dictates steer in chat ("add to steering: never touch `config/loader.ts`"), record the exact words with `--kind steer`.

- Steer is per workflow. A convention of the whole project belongs in `AGENTS.md`, `CLAUDE.md` or `sdlc-config.json`.
- In an autonomous run (`/wf yolo`), a `steer` veto outranks every policy default.
- A `steer` entry can answer one NAMED intent-bearing question (per [_decision-classes.md](_decision-classes.md)) in advance. It cannot give an autonomous run standing leave to settle intent-bearing decisions in general.
- `status <slug> deep` reads the `steer` entries as signal. An artifact that contradicts a live `steer` entry is a drift finding.
- A `steer` entry that recurs across workflows can become a solutions-corpus learning at retro.

## Older workflows

A workflow from before the store keeps `po-answers.md` and `steer.md`. Until the store exists, `decide list`, `answered` and `drop` read those two files. The first `decide add` copies them into the store, and after that the store is the only source. `decide import` copies them on request; a second import adds nothing. Do not write to `po-answers.md` or `steer.md`.
