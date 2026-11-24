# The decision store (decisions.yaml)

This file is the one statement of the decision contract. Every stage reference cites it by name and does not restate it.

The decision store holds what the person decided for one workflow: the answers to questions, the standing steer, the approvals, the try-out verdicts and the choices made in delegate mode. A question is asked once. A stage reads the answer from the store and does not ask again.

## The file

`<wf-dir>/decisions.yaml`. Only `wf.mjs decide` writes it. Never write or edit the file with a file tool.

Each entry has these fields:

| Field | Value |
|---|---|
| `id` | `D-001`, `D-002` and so on, in the order of writing |
| `at` | the time of writing |
| `kind` | `answer`, `steer`, `approval`, `try-out` or `delegate` |
| `key` | a stable kebab-case name of the decision, for example `auth-method`; a `steer` entry can have none |
| `question` | the question as asked |
| `answer` | the answer, in the person's exact words |
| `by` | `person`, `policy`, `delegate`, `stage` (a build stage wrote a `note` or a `settled` entry), `standing:<id>`, `standing rule` or `standing default`; `standing:<id>` names the standing answer of the workflow that settled the case, and `standing rule` a standing answer of the project ([_gate-question.md](_gate-question.md), "Standing answers") |
| `scope` | `packet`, `slice` and `files`; an absent field means every packet, slice or file |
| `stage` | the stage that asked |
| `rewrote` | the records that the answer changed |
| `superseded-by` | the id of the entry that replaced this entry, or null |

An entry is live until a later entry supersedes it. A new entry with the same key and the same scope supersedes the old one. An `approval` or a `try-out` supersedes only an entry of its own kind, so an approval of a decision does not replace the decision.

When several live entries of one key apply to a question, the one that fits its scope best answers it: an entry of exactly that scope; else, for a question of a slice, the entry of that slice over an entry with no slice; for a question with no slice, the entry with no slice over an entry of a slice. Among equals, the entry written last answers.

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
| Wait for the answer to a held question | `<wf> decide wait "<projectRoot>" <slug> --key k[,k2] --stage <stage> [--slice s]`: one call blocks for 4 minutes at most, so give the shell call a timeout of 5 minutes. It prints the answer, or `still waiting` (run it again at once). The wait has no limit |
| Record an answer | `<wf> decide add "<projectRoot>" <slug> --key k --question "<q>" --answer "<a>" --stage <stage> [--slice s] [--files f,g] [--rewrote f,g]` |
| Record several answers in one call | `<wf> decide add "<projectRoot>" <slug> --file <answers.json>`: a JSON list of `{ key, question, answer, by, stage, slice }` |
| Record standing steer | `<wf> decide add "<projectRoot>" <slug> --kind steer --answer "<exact words>" [--slice s] [--replaces D-012]` |
| The rules, steers and notes of one slice | `<wf> decide list "<projectRoot>" <slug> --kind steer,note --slice <slice> --rules` |
| Leave a hand-off for another slice | `<wf> decide add "<projectRoot>" <slug> --kind note --slice <the slice it is for> --stage <stage> --answer "<the hand-off>"` |
| Record the decisions that a stage settled itself | `<wf> decide add "<projectRoot>" <slug> --file <settled.json>`: a JSON list of `{ kind: "settled", class, slice, stage, key, question, answer }` |
| End a steer that no longer holds, or a note that was handled | `<wf> decide end "<projectRoot>" <slug> <id> --reason "<why>"` |
| Tidy the steers and notes against the roster | `<wf> decide tidy "<projectRoot>" <slug> [--apply] [--full]` |
| A rule of the whole project | `<wf> rule add "<projectRoot>" --key k --text "<exact words>"`, `rule list`, `rule end`, `rule candidates`, `rule adopt --from <slug>:<id>` |
| Record an approval | `<wf> decide add "<projectRoot>" <slug> --kind approval --key <decision key> --answer approved` |
| Record a try-out | `<wf> decide add "<projectRoot>" <slug> --kind try-out --key try-out --answer works\|fails` |

Pass `--json` to read the result as data.

## The contract every stage honors

1. **Read.** At Step 0, run `decide list` for the scope of the stage. The brief of a stage agent already holds these entries. No entry means no decision: continue, and add no steering fields.
2. **Do not ask a decided question.** Before a question, run `decide answered` for its key, or `decide drop` for a batch. When a live entry answers the question, use the answer, cite its id, and do not ask. Ask again only when a fact changed, and say which fact.
3. **Record every answer.** After the person answers, run `decide add` with a stable key, the question, the exact answer and the stage. Give `--slice` or `--files` when the answer binds one slice or some files only. The command also takes the key out of `open-questions` of the index, so the status no longer shows the workflow as blocked on that question.
4. **State the limit of an answer.** An answer decides only the question that was asked. When an answer closes an approach (a vendor, a library, a budget), the requirement that the approach served is not dropped. The stage either (a) shows that the requirement is still met another way, or (b) asks the person a follow-up question about the requirement itself. A vendor answer ("no Neon; only Cloudflare backends") does not decide a requirement ("no sync in v1"): that is a second decision. Put the limit in the answer: `scope: chooses the sync vendor; does NOT decide whether v1 syncs.` The Intake Fidelity table of shape and the intent-fidelity review read this limit.
5. **Rewrite what the answer changes.** When an answer changes the build, rewrite the plan section that it changes in the same step. Pass the changed files with `--rewrote`.
6. **Precedence.** A live instruction of the person in this session outranks a `steer` entry, and a `steer` entry outranks a default of a stage reference. A `steer` entry never overrides a mandatory gate: the External Output Boundary, AC verifiability, or the plan and verify constraint rule. When an entry tries to, show it to the person. Do not obey it.
7. **Conflict.** When an entry conflicts with the stage contract, is impossible for this stage, or is ambiguous, ask a gate question per [_gate-question.md](_gate-question.md). Never ignore the entry, and never obey it into a broken state.
8. **Acknowledge.** When a live `steer` entry applies, the stage artifact lists what it honored in a `steering-honored:` frontmatter list, for example `["avoided config/loader.ts"]`. When no `steer` entry applies, omit the field.
9. **Propagate.** A sub-agent starts with fresh context. A stage that starts sub-agents gives each one the live entries in its scope: the brief command prints them, or the stage runs `decide list` for the sub-agent's scope and puts the lines in its prompt.

## Steer

A `steer` entry is a standing constraint or preference of the person, for example "do not touch `config/loader.ts`", "prefer the queue approach" or "no new runtime deps". Stages never write a `steer` entry of their own: `decide add --kind steer` with `--stage plan`, `implement`, `verify` or `review` is refused. When the person dictates steer in chat ("add to steering: never touch `config/loader.ts`"), record the exact words with `--kind steer`.

- **A steer has a reach.** Give `--slice` to a steer that binds one slice: it ends when that slice is complete, and no other slice reads it. A steer with no slice binds the whole workflow, and every stage of every slice reads it, so keep it short.
- **A new steer names the one it replaces.** When the words of the person contradict a live steer, pass `--replaces <id>`: the old entry leaves every list. Two live steers that say opposite things leave the agent to choose.
- **A rule of the whole project is not a steer.** Record it once with `rule add`. Each brief of each workflow prints the project rules, so the rule is not copied into every workflow. `rule candidates` lists the steers that say the same in 3 or more workflows, and `rule adopt` makes one of them a rule and ends the copies.
- **A steer that no longer holds is ended**, with `decide end` and the reason. The person decides this, never a stage.
- In an autonomous run (`/wf yolo`), a `steer` veto outranks every policy default.
- A `steer` entry can answer one NAMED intent-bearing question (per [_decision-classes.md](_decision-classes.md)) in advance. It cannot give an autonomous run standing leave to settle intent-bearing decisions in general.
- `status <slug> deep` reads the `steer` entries as signal. An artifact that contradicts a live `steer` entry is a drift finding.
- A `steer` entry that recurs across workflows can become a solutions-corpus learning at retro.

## Notes and settled entries

A build stage (plan, implement, verify, review) writes two kinds of entry, both `by: stage`.

- A `note` is a hand-off to one slice: a red test that the slice owns, a finding for it, a file that was changed under it. It needs `--slice`. Only that slice reads it. The stage that handles it ends it with `decide end`. `decide tidy --apply` ends the notes of a slice that is done.
- A `settled` entry is a decision that the stage settled itself, with its `class` per [_decision-classes.md](_decision-classes.md). No brief and no list shows it unless `--kind settled` asks: it is the record of what the run chose, for the person and for an audit.

## Older workflows

A workflow from before the store keeps `po-answers.md` and `steer.md`. Until the store exists, `decide list`, `answered` and `drop` read those two files. The first `decide add` copies them into the store, and after that the store is the only source. `decide import` copies them on request; a second import adds nothing. Do not write to `po-answers.md` or `steer.md`.
